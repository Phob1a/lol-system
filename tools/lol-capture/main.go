// lol-capture: 手动执行版国服自定义对局结算抓取工具
//
// 用法：英雄联盟客户端登录状态下，打完一局自定义后，双击运行本 exe。
// 程序会连接本地 LCU API，抓取「最近一局」对局的完整结算数据，
// 打印到控制台并存为 result_<时间戳>.json，全过程写入 capture.log。
// 任何一步失败都会打印明确错误，并停在窗口等待回车，方便排查。
//
// 可选参数：
//   --custom-only        只抓最近一局自定义对局（生产/内战阶段用，避免误抓匹配/排位）
//   --server <url>       抓完自动上传到服务器（不传则仅本地保存）
//   --token  <val>       服务器 Bearer 令牌（与 --server 配合使用）
package main

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

// ---- 日志：同时输出到控制台和 capture.log ----

var logFile *os.File

func logf(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	ts := time.Now().Format("2006-01-02 15:04:05")
	line := fmt.Sprintf("[%s] %s", ts, msg)
	consoleWrite(line + "\n")
	if logFile != nil {
		fmt.Fprintln(logFile, line)
	}
}

// fatalf 打印错误、写日志、停住窗口等回车后退出。
func fatalf(step string, err error) {
	logf("❌ 失败 [%s]: %v", step, err)
	logf("如需调试，请把上面的错误信息和同目录下的 capture.log 一起发回。")
	pauseExit(1)
}

func pauseExit(code int) {
	consoleWrite("\n按回车键退出...")
	fmt.Scanln()
	if logFile != nil {
		logFile.Close()
	}
	os.Exit(code)
}

// ---- LCU 凭据发现 ----

type lcuCreds struct {
	port  string
	token string
}

// findCreds 拿到 LCU 的 app-port 和 auth-token。
// 不只依赖「读进程命令行」这一条脆弱路径（国服腾讯/WeGame 环境可能 WMI 被禁、
// 命令行读取需管理员、包装层差异）：先试命令行，失败再退到 lockfile 文件解析。
func findCreds() (*lcuCreds, error) {
	var reasons []string

	// 路径一：进程命令行 --app-port / --remoting-auth-token
	if c, err := credsFromCmdline(); err == nil {
		return c, nil
	} else {
		reasons = append(reasons, "命令行方式："+err.Error())
	}

	// 路径二：lockfile（name:pid:port:password:protocol）——纯文件读取，绕开命令行权限问题
	if c, err := credsFromLockfile(); err == nil {
		return c, nil
	} else {
		reasons = append(reasons, "lockfile 方式："+err.Error())
	}

	hint := ""
	if runtime.GOOS == "windows" {
		hint = "\n排查建议：1) 确认客户端已登录并停在主界面；2) 若仍失败，请右键「以管理员身份运行」本工具（读取进程命令行可能需要管理员权限）。"
	}
	return nil, fmt.Errorf("未能获取客户端凭据。已尝试两种方式均失败：\n- %s%s", strings.Join(reasons, "\n- "), hint)
}

func credsFromCmdline() (*lcuCreds, error) {
	var cmdline string
	var err error
	if runtime.GOOS == "windows" {
		cmdline, err = findCmdlineWindows()
	} else {
		cmdline, err = findCmdlineUnix()
	}
	if err != nil {
		return nil, err
	}
	if cmdline == "" {
		return nil, fmt.Errorf("没有找到正在运行的英雄联盟客户端进程（LeagueClientUx）")
	}
	portRe := regexp.MustCompile(`--app-port=(\d+)`)
	tokenRe := regexp.MustCompile(`--remoting-auth-token=([\w-]+)`)
	pm := portRe.FindStringSubmatch(cmdline)
	tm := tokenRe.FindStringSubmatch(cmdline)
	if pm == nil || tm == nil {
		return nil, fmt.Errorf("找到了客户端进程但未能解析出端口/令牌（命令行可能被权限截断）")
	}
	return &lcuCreds{port: pm[1], token: tm[1]}, nil
}

// credsFromLockfile 定位客户端安装目录下的 lockfile 并解析端口/密码。
func credsFromLockfile() (*lcuCreds, error) {
	var candidates []string

	// 优先：从运行中进程的可执行路径推导安装目录
	if runtime.GOOS == "windows" {
		if dir := installDirFromProcess(); dir != "" {
			candidates = append(candidates, filepath.Join(dir, "lockfile"))
		}
		// 兜底：常见安装目录（含国服/腾讯典型路径）
		candidates = append(candidates,
			`C:\Riot Games\League of Legends\lockfile`,
			`C:\Program Files\Riot Games\League of Legends\lockfile`,
			`C:\Program Files (x86)\Riot Games\League of Legends\lockfile`,
			`C:\Program Files\WeGameApps\英雄联盟\LeagueClient\lockfile`,
			`C:\WeGameApps\英雄联盟\LeagueClient\lockfile`,
			`D:\WeGameApps\英雄联盟\LeagueClient\lockfile`,
		)
	}

	var tried []string
	for _, p := range candidates {
		c, err := parseLockfile(p)
		if err == nil {
			return c, nil
		}
		tried = append(tried, p)
	}
	if len(tried) == 0 {
		return nil, fmt.Errorf("未能定位 lockfile（无法从进程推导安装目录）")
	}
	return nil, fmt.Errorf("在以下位置均未找到可用 lockfile：%s", strings.Join(tried, "; "))
}

func parseLockfile(path string) (*lcuCreds, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	// 格式：LeagueClient:<pid>:<port>:<password>:<protocol>
	parts := strings.Split(strings.TrimSpace(string(b)), ":")
	if len(parts) < 5 {
		return nil, fmt.Errorf("lockfile 格式异常：%s", path)
	}
	return &lcuCreds{port: parts[2], token: parts[3]}, nil
}

// installDirFromProcess 读取 LeagueClientUx.exe 的可执行路径，返回其所在目录。
func installDirFromProcess() string {
	ps := exec.Command("powershell", "-NoProfile", "-Command",
		`Get-CimInstance Win32_Process -Filter "name='LeagueClientUx.exe'" | Select-Object -ExpandProperty ExecutablePath`)
	out, err := ps.Output()
	if err != nil {
		return ""
	}
	p := strings.TrimSpace(string(out))
	if p == "" {
		return ""
	}
	return filepath.Dir(p)
}

func findCmdlineWindows() (string, error) {
	// 优先 PowerShell（Win10+ 默认有）
	ps := exec.Command("powershell", "-NoProfile", "-Command",
		`Get-CimInstance Win32_Process -Filter "name='LeagueClientUx.exe'" | Select-Object -ExpandProperty CommandLine`)
	out, err := ps.Output()
	if err == nil && strings.Contains(string(out), "--app-port") {
		return string(out), nil
	}
	// 回退 wmic（老系统）
	wmic := exec.Command("wmic", "PROCESS", "WHERE", "name='LeagueClientUx.exe'", "GET", "CommandLine")
	out2, err2 := wmic.Output()
	if err2 == nil {
		return string(out2), nil
	}
	if err != nil && err2 != nil {
		return "", fmt.Errorf("PowerShell 与 wmic 均无法读取进程：%v / %v", err, err2)
	}
	return string(out2), nil
}

func findCmdlineUnix() (string, error) {
	out, err := exec.Command("sh", "-c", "ps -axww | grep -i LeagueClientUx | grep -v grep").Output()
	if err != nil {
		// grep 无匹配会返回非零，这里当作没找到处理
		return "", nil
	}
	return string(out), nil
}

func truncate(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) > n {
		return s[:n] + "...(已截断)"
	}
	return s
}

// ---- LCU HTTP 客户端 ----

type lcuClient struct {
	base  string
	token string
	http  *http.Client
}

func newClient(c *lcuCreds) *lcuClient {
	return &lcuClient{
		base:  fmt.Sprintf("https://127.0.0.1:%s", c.port),
		token: c.token,
		http: &http.Client{
			Timeout:   15 * time.Second,
			Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}},
		},
	}
}

func (lc *lcuClient) get(path string) ([]byte, error) {
	req, err := http.NewRequest("GET", lc.base+path, nil)
	if err != nil {
		return nil, err
	}
	req.SetBasicAuth("riot", lc.token)
	resp, err := lc.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求 %s 失败：%w", path, err)
	}
	defer resp.Body.Close()
	body, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return nil, fmt.Errorf("读取 %s 响应体失败（HTTP %d）：%w", path, resp.StatusCode, readErr)
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("请求 %s 返回 HTTP %d：%s", path, resp.StatusCode, truncate(string(body), 300))
	}
	return body, nil
}

// ---- 对局数据结构（只取关心的字段，其余原始 JSON 整体保存）----

type matchListResp struct {
	Games struct {
		Games []gameSummary `json:"games"`
	} `json:"games"`
}

type gameSummary struct {
	GameID       int64  `json:"gameId"`
	GameCreation int64  `json:"gameCreation"`
	GameMode     string `json:"gameMode"`
	GameType     string `json:"gameType"`
	QueueID      int    `json:"queueId"`
	GameDuration int    `json:"gameDuration"`
}

type gameDetail struct {
	GameID                int64                 `json:"gameId"`
	GameMode              string                `json:"gameMode"`
	GameType              string                `json:"gameType"`
	GameDuration          int                   `json:"gameDuration"`
	Participants          []participant         `json:"participants"`
	ParticipantIdentities []participantIdentity `json:"participantIdentities"`
}

type participant struct {
	ParticipantID int `json:"participantId"`
	TeamID        int `json:"teamId"`
	ChampionID    int `json:"championId"`
	Stats         struct {
		Win                         bool `json:"win"`
		Kills                       int  `json:"kills"`
		Deaths                      int  `json:"deaths"`
		Assists                     int  `json:"assists"`
		TotalDamageDealtToChampions int  `json:"totalDamageDealtToChampions"`
		GoldEarned                  int  `json:"goldEarned"`
		TotalMinionsKilled          int  `json:"totalMinionsKilled"`
		NeutralMinionsKilled        int  `json:"neutralMinionsKilled"`
		VisionScore                 int  `json:"visionScore"`
		Item0                       int  `json:"item0"`
		Item1                       int  `json:"item1"`
		Item2                       int  `json:"item2"`
		Item3                       int  `json:"item3"`
		Item4                       int  `json:"item4"`
		Item5                       int  `json:"item5"`
		Item6                       int  `json:"item6"`
	} `json:"stats"`
}

type participantIdentity struct {
	ParticipantID int `json:"participantId"`
	Player        struct {
		SummonerName string `json:"summonerName"`
		GameName     string `json:"gameName"`
		TagLine      string `json:"tagLine"`
	} `json:"player"`
}

// customOnly=false（默认）：抓最近一局，任意对局类型，便于先验证抓取链路是否通。
// 传 --custom-only：只抓最近的一局自定义对局（生产/内战阶段用，避免误抓匹配/排位）。
var customOnly bool

func main() {
	var server, token string
	args := os.Args[1:]
	for i := 0; i < len(args); i++ {
		a := args[i]
		switch {
		case a == "--custom-only":
			customOnly = true
		case strings.HasPrefix(a, "--server="):
			server = strings.TrimPrefix(a, "--server=")
		case a == "--server" && i+1 < len(args):
			i++
			server = args[i]
		case strings.HasPrefix(a, "--token="):
			token = strings.TrimPrefix(a, "--token=")
		case a == "--token" && i+1 < len(args):
			i++
			token = args[i]
		}
	}

	// 在 exe 同目录建日志
	var ferr error
	logFile, ferr = os.Create("capture.log")
	if ferr != nil {
		fmt.Println("警告：无法创建 capture.log：", ferr)
	}

	logf("===== lol-capture 启动（手动执行版）=====")
	logf("运行平台：%s/%s  customOnly=%v", runtime.GOOS, runtime.GOARCH, customOnly)

	// 1. 找客户端凭据
	logf("步骤 1/4：查找英雄联盟客户端...")
	creds, err := findCreds()
	if err != nil {
		fatalf("查找客户端凭据", err)
	}
	logf("✅ 已连接客户端，端口 %s", creds.port)
	lc := newClient(creds)

	// 2. 确认登录态
	logf("步骤 2/4：确认登录账号...")
	sumBody, err := lc.get("/lol-summoner/v1/current-summoner")
	if err != nil {
		fatalf("读取当前召唤师", err)
	}
	var sum struct {
		DisplayName  string `json:"displayName"`
		GameName     string `json:"gameName"`
		SummonerName string `json:"summonerName"`
	}
	_ = json.Unmarshal(sumBody, &sum)
	who := firstNonEmpty(sum.GameName, sum.DisplayName, sum.SummonerName, "(未知)")
	logf("✅ 当前账号：%s", who)

	// 3. 拉取最近对局列表
	logf("步骤 3/4：拉取最近对局列表...")
	listBody, err := lc.get("/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=20")
	if err != nil {
		fatalf("拉取对局列表", err)
	}
	var list matchListResp
	if err := json.Unmarshal(listBody, &list); err != nil {
		fatalf("解析对局列表", fmt.Errorf("%w；原始返回：%s", err, truncate(string(listBody), 300)))
	}
	games := list.Games.Games
	if len(games) == 0 {
		fatalf("选择对局", fmt.Errorf("对局历史为空，没有可抓取的对局"))
	}

	// 默认：抓「最近一局」（任意对局类型），便于先验证抓取链路是否通。
	// 传 --custom-only 时，在最近列表里选「最新的一局自定义对局」，找不到则 fatal。
	targetIdx := -1
	if customOnly {
		for i, g := range games {
			if g.GameType == "CUSTOM_GAME" {
				targetIdx = i
				break
			}
		}
	} else {
		targetIdx = 0
	}

	// 列出最近几局供你核对抓的是不是对的那局
	logf("最近对局列表：")
	for i, g := range games {
		if i >= 8 {
			break
		}
		marker := "  "
		if i == targetIdx {
			marker = "▶ "
		}
		logf("%s[%d] gameId=%d 模式=%s 类型=%s 时长=%s 时间=%s",
			marker, i, g.GameID, g.GameMode, g.GameType, dur(g.GameDuration), tsToStr(g.GameCreation))
	}

	if targetIdx < 0 {
		fatalf("选择对局", fmt.Errorf("最近 %d 局里没有找到自定义对局（CUSTOM_GAME）。当前为 --custom-only 模式；去掉该参数即可抓最近一局任意对局", len(games)))
	}
	target := games[targetIdx]
	logf("已选定目标对局：gameId=%d 类型=%s", target.GameID, target.GameType)
	if target.GameType != "CUSTOM_GAME" {
		logf("提示：目标不是自定义对局（当前 %s），验证阶段抓任意对局以确认链路；正式内战请加 --custom-only。", target.GameType)
	}

	// 4. 拉取目标对局完整详情
	logf("步骤 4/4：拉取对局 %d 完整结算...", target.GameID)
	detailBody, err := lc.get(fmt.Sprintf("/lol-match-history/v1/games/%d", target.GameID))
	if err != nil {
		fatalf("拉取对局详情", err)
	}
	// 先把原始 JSON 落盘留档：无论后续校验是否通过，都要有 debug 文件可发回。
	stamp := time.Now().Format("20060102_150405")
	rawName := fmt.Sprintf("result_%s_raw.json", stamp)
	if err := os.WriteFile(rawName, detailBody, 0644); err != nil {
		fatalf("保存原始结算 JSON", err)
	}
	logf("✅ 原始结算数据已保存：%s", rawName)

	var detail gameDetail
	if err := json.Unmarshal(detailBody, &detail); err != nil {
		fatalf("解析对局详情", fmt.Errorf("%w（原始 JSON 已存为 %s 供排查）", err, rawName))
	}

	// 不变量校验：LCU 在国服可能字段形状不同，json.Unmarshal 不会因缺字段报错，
	// 所以必须显式校验，避免把「缺名字/0 值/人数不对」的残缺数据当成功产物。
	if err := validateDetail(&detail, target.GameID); err != nil {
		fatalf("结算数据校验", fmt.Errorf("%w（原始 JSON 已存为 %s，请发回排查国服字段差异）", err, rawName))
	}
	logf("✅ 结算数据校验通过（10 名选手、双方阵容、关键字段齐全）")

	// 拉取英雄 id→名 映射（国服客户端返回中文名）；失败仅回退用 championId 显示，不阻断。
	champ := fetchChampionNames(lc)

	// 打印选手数据表
	printScoreboard(&detail, champ)

	// 保存精简汇总：作为输出契约之一，写失败按失败处理（不让用户误以为产物完整）。
	summary := buildSummary(&detail, champ, detailBody)
	sumName := fmt.Sprintf("result_%s_summary.json", stamp)
	b, err := json.MarshalIndent(summary, "", "  ")
	if err != nil {
		fatalf("生成精简汇总", err)
	}
	if err := os.WriteFile(sumName, b, 0644); err != nil {
		fatalf("保存精简汇总", err)
	}
	logf("✅ 精简汇总已保存：%s", sumName)

	// 可选：上传到服务器（--server + --token）；失败不影响本地文件，不改变退出路径。
	if server != "" && token != "" {
		if err := uploadSummary(server, token, b); err != nil {
			logf("⚠️ 上传失败：%v；本地文件已保存，可稍后手动导入", err)
		} else {
			logf("✅ 已上传到服务器")
		}
	} else if (server != "") != (token != "") {
		logf("⚠️ 只提供了 --server 或 --token 之一，未执行上传（两者需同时提供）。")
	}

	logf("===== 抓取完成 =====")
	logf("请核对上面的选手数据是否正确；把 %s 和 capture.log 发回即可。", rawName)
	pauseExit(0)
}

func printScoreboard(d *gameDetail, champ map[int]string) {
	names := participantNames(d)
	logf("--------------------------------------------------------------")
	logf("对局 %d  模式=%s  类型=%s  时长=%s", d.GameID, d.GameMode, d.GameType, dur(d.GameDuration))
	logf("%-22s %-4s %-10s %-8s %-7s %-5s %-5s", "选手", "队伍", "英雄", "KDA", "伤害", "金币", "补刀")
	for _, p := range d.Participants {
		s := p.Stats
		cs := s.TotalMinionsKilled + s.NeutralMinionsKilled
		team := "蓝"
		if p.TeamID == 200 {
			team = "红"
		}
		result := "胜"
		if !s.Win {
			result = "负"
		}
		logf("%-22s %-4s %-10s %d/%d/%d   %-7d %-5d %-5d [%s]",
			truncate(names[p.ParticipantID], 22), team, champLabel(champ, p.ChampionID),
			s.Kills, s.Deaths, s.Assists, s.TotalDamageDealtToChampions, s.GoldEarned, cs, result)
	}
	logf("--------------------------------------------------------------")
	logf("注：英雄名取自客户端（国服为中文名）；未能映射时回退显示 C+championId。")
}

func participantNames(d *gameDetail) map[int]string {
	names := map[int]string{}
	for _, pi := range d.ParticipantIdentities {
		// 国服 LCU 可能 gameName 为空、只有 summonerName。
		// 仅当 gameName 非空时才拼 #tagLine，否则回退 summonerName。
		n := strings.TrimSpace(pi.Player.GameName)
		if n != "" && pi.Player.TagLine != "" {
			n = n + "#" + pi.Player.TagLine
		}
		if n == "" {
			n = strings.TrimSpace(pi.Player.SummonerName)
		}
		names[pi.ParticipantID] = n
	}
	return names
}

// playerSummary：每名选手的全量数据。stats 保留 LCU 原始 stats 的所有字段
//（KDA/各类伤害/承伤/治疗/补刀/野怪/视野/插眼排眼/推塔水晶/控制/连杀多杀/一血/
// 出装 item0-6/符文 perk*/段位等，约 118 项），name/championName/召唤师技能为附加便利字段。
type playerSummary struct {
	Name          string                 `json:"name"`
	ChampionID    int                    `json:"championId"`
	ChampionName  string                 `json:"championName"`
	TeamID        int                    `json:"teamId"`
	ParticipantID int                    `json:"participantId"`
	Spell1Id      int                    `json:"spell1Id"`
	Spell2Id      int                    `json:"spell2Id"`
	Stats         map[string]interface{} `json:"stats"`
}

type matchSummary struct {
	GameID       int64             `json:"gameId"`
	GameMode     string            `json:"gameMode"`
	GameType     string            `json:"gameType"`
	QueueID      int               `json:"queueId"`
	MapID        int               `json:"mapId"`
	GameVersion  string            `json:"gameVersion"`
	GameCreation int64             `json:"gameCreation"`
	Duration     int               `json:"gameDuration"`
	Teams        []json.RawMessage `json:"teams"` // 各队胜负/大龙小龙推塔/一血/ban 等，原样保留
	Players      []playerSummary   `json:"players"`
}

// buildSummary 产出「全量」精简汇总：直接从原始详情通用解析出每名选手的完整 stats、
// 召唤师技能与队伍目标，确保不漏字段（用户要求先全量统计，后续再决定取用哪些）。
func buildSummary(d *gameDetail, champ map[int]string, rawDetail []byte) matchSummary {
	names := participantNames(d)

	var g struct {
		QueueID      int               `json:"queueId"`
		MapID        int               `json:"mapId"`
		GameVersion  string            `json:"gameVersion"`
		GameCreation int64             `json:"gameCreation"`
		Teams        []json.RawMessage `json:"teams"`
		Participants []struct {
			ParticipantID int                    `json:"participantId"`
			TeamID        int                    `json:"teamId"`
			ChampionID    int                    `json:"championId"`
			Spell1Id      int                    `json:"spell1Id"`
			Spell2Id      int                    `json:"spell2Id"`
			Stats         map[string]interface{} `json:"stats"`
		} `json:"participants"`
	}
	// rawDetail 已在上游成功解析为 gameDetail，这里再做一次通用解析以拿全字段。
	_ = json.Unmarshal(rawDetail, &g)

	ms := matchSummary{
		GameID: d.GameID, GameMode: d.GameMode, GameType: d.GameType,
		QueueID: g.QueueID, MapID: g.MapID, GameVersion: g.GameVersion,
		GameCreation: g.GameCreation, Duration: d.GameDuration, Teams: g.Teams,
	}
	for _, p := range g.Participants {
		ms.Players = append(ms.Players, playerSummary{
			Name:          names[p.ParticipantID],
			ChampionID:    p.ChampionID,
			ChampionName:  champ[p.ChampionID],
			TeamID:        p.TeamID,
			ParticipantID: p.ParticipantID,
			Spell1Id:      p.Spell1Id,
			Spell2Id:      p.Spell2Id,
			Stats:         p.Stats,
		})
	}
	return ms
}

// validateDetail 校验对局详情的关键不变量，任一不满足即返回 error。
func validateDetail(d *gameDetail, wantGameID int64) error {
	if d.GameID != wantGameID {
		return fmt.Errorf("对局 ID 不一致：详情返回 %d，期望 %d", d.GameID, wantGameID)
	}
	if len(d.Participants) != 10 {
		return fmt.Errorf("选手人数异常：期望 10，实际 %d", len(d.Participants))
	}
	if len(d.ParticipantIdentities) < 10 {
		return fmt.Errorf("选手身份条目不足：期望 ≥10，实际 %d", len(d.ParticipantIdentities))
	}

	names := participantNames(d)
	teamCount := map[int]int{}
	totalDamage := 0
	for _, p := range d.Participants {
		if strings.TrimSpace(names[p.ParticipantID]) == "" {
			return fmt.Errorf("participantId=%d 缺少选手名（身份映射失败，可能国服名字字段不同）", p.ParticipantID)
		}
		if p.ChampionID <= 0 {
			return fmt.Errorf("participantId=%d 英雄 ID 异常：%d", p.ParticipantID, p.ChampionID)
		}
		if p.TeamID != 100 && p.TeamID != 200 {
			return fmt.Errorf("participantId=%d 队伍 ID 异常：%d（应为 100/200）", p.ParticipantID, p.TeamID)
		}
		teamCount[p.TeamID]++
		totalDamage += p.Stats.TotalDamageDealtToChampions
	}
	if teamCount[100] != 5 || teamCount[200] != 5 {
		return fmt.Errorf("双方人数不是 5v5：蓝 %d / 红 %d", teamCount[100], teamCount[200])
	}
	if totalDamage <= 0 {
		return fmt.Errorf("全场对英雄伤害合计为 0，疑似字段结构不符（国服 stats 字段可能不同）")
	}
	return nil
}

// champLabel 返回英雄显示名：能映射到名字就用名字，否则回退 C+championId。
func champLabel(champ map[int]string, id int) string {
	if n := strings.TrimSpace(champ[id]); n != "" {
		return n
	}
	return fmt.Sprintf("C%d", id)
}

// fetchChampionNames 从客户端拉取 championId→英雄名 映射。
// 数据源是 LCU 静态资源 champion-summary.json，名字随客户端语言（国服为中文名）。
// best-effort：任何失败都只 warning 并返回空表，由 champLabel 回退到 C+id，不阻断主流程。
func fetchChampionNames(lc *lcuClient) map[int]string {
	m := map[int]string{}
	body, err := lc.get("/lol-game-data/assets/v1/champion-summary.json")
	if err != nil {
		logf("⚠️ 拉取英雄名映射失败，将用 championId 显示：%v", err)
		return m
	}
	var arr []struct {
		ID   int    `json:"id"`
		Name string `json:"name"`
	}
	if err := json.Unmarshal(body, &arr); err != nil {
		logf("⚠️ 解析英雄名映射失败，将用 championId 显示：%v", err)
		return m
	}
	for _, c := range arr {
		if c.ID > 0 && strings.TrimSpace(c.Name) != "" {
			m[c.ID] = strings.TrimSpace(c.Name)
		}
	}
	logf("✅ 已加载英雄名映射：%d 个英雄", len(m))
	return m
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func dur(sec int) string {
	if sec <= 0 {
		return "-"
	}
	return fmt.Sprintf("%d分%d秒", sec/60, sec%60)
}

func tsToStr(ms int64) string {
	if ms <= 0 {
		return "-"
	}
	return time.UnixMilli(ms).Format("2006-01-02 15:04")
}
