package main

import (
	"os"
	"path/filepath"
	"testing"
)

// makeValidDetail 构造一局合法的 5v5 自定义对局详情。
func makeValidDetail(gameID int64) *gameDetail {
	d := &gameDetail{GameID: gameID, GameType: "CUSTOM_GAME", GameMode: "CLASSIC", GameDuration: 1800}
	for i := 1; i <= 10; i++ {
		team := 100
		if i > 5 {
			team = 200
		}
		p := participant{ParticipantID: i, TeamID: team, ChampionID: 100 + i}
		p.Stats.Kills = i
		p.Stats.TotalDamageDealtToChampions = 1000 * i
		d.Participants = append(d.Participants, p)
		pi := participantIdentity{ParticipantID: i}
		pi.Player.GameName = "player"
		pi.Player.TagLine = "CN1"
		d.ParticipantIdentities = append(d.ParticipantIdentities, pi)
	}
	return d
}

func TestValidateDetail_Valid(t *testing.T) {
	if err := validateDetail(makeValidDetail(42), 42); err != nil {
		t.Fatalf("合法对局不应报错，却得到：%v", err)
	}
}

func TestValidateDetail_Failures(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(*gameDetail)
		want   int64
	}{
		{"gameId 不一致", func(d *gameDetail) {}, 999},
		{"人数不足", func(d *gameDetail) { d.Participants = d.Participants[:9] }, 42},
		{"缺少选手名", func(d *gameDetail) { d.ParticipantIdentities[0].Player.GameName = ""; d.ParticipantIdentities[0].Player.TagLine = "" }, 42},
		{"英雄ID异常", func(d *gameDetail) { d.Participants[0].ChampionID = 0 }, 42},
		{"队伍ID异常", func(d *gameDetail) { d.Participants[0].TeamID = 300 }, 42},
		{"非5v5", func(d *gameDetail) { d.Participants[9].TeamID = 100 }, 42},
		{"零伤害", func(d *gameDetail) {
			for i := range d.Participants {
				d.Participants[i].Stats.TotalDamageDealtToChampions = 0
			}
		}, 42},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			d := makeValidDetail(42)
			c.mutate(d)
			if err := validateDetail(d, c.want); err == nil {
				t.Fatalf("期望校验失败，却通过了")
			}
		})
	}
}

func TestParticipantNames_Fallback(t *testing.T) {
	d := &gameDetail{}
	// 1) 国服形态：gameName 空，只有 summonerName → 应回退到 summonerName
	pi1 := participantIdentity{ParticipantID: 1}
	pi1.Player.SummonerName = "国服老哥"
	// 2) Riot ID 形态：gameName + tagLine → 拼成 name#tag
	pi2 := participantIdentity{ParticipantID: 2}
	pi2.Player.GameName = "Faker"
	pi2.Player.TagLine = "KR1"
	pi2.Player.SummonerName = "ignored"
	// 3) gameName 空但 tagLine 有值 → 不应产生 "#TAG"，回退 summonerName
	pi3 := participantIdentity{ParticipantID: 3}
	pi3.Player.TagLine = "CN1"
	pi3.Player.SummonerName = "备用名"
	d.ParticipantIdentities = []participantIdentity{pi1, pi2, pi3}

	names := participantNames(d)
	if names[1] != "国服老哥" {
		t.Fatalf("期望回退 summonerName，得到 %q", names[1])
	}
	if names[2] != "Faker#KR1" {
		t.Fatalf("期望 Faker#KR1，得到 %q", names[2])
	}
	if names[3] != "备用名" {
		t.Fatalf("gameName 空时不应产生 #TAG，应回退 summonerName，得到 %q", names[3])
	}
}

func TestParseLockfile(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "lockfile")
	if err := os.WriteFile(p, []byte("LeagueClient:12345:54321:abc-token_XYZ:https"), 0644); err != nil {
		t.Fatal(err)
	}
	c, err := parseLockfile(p)
	if err != nil {
		t.Fatalf("解析失败：%v", err)
	}
	if c.port != "54321" || c.token != "abc-token_XYZ" {
		t.Fatalf("解析结果不对：port=%s token=%s", c.port, c.token)
	}
}

func TestParseLockfile_Malformed(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "lockfile")
	if err := os.WriteFile(p, []byte("garbage"), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := parseLockfile(p); err == nil {
		t.Fatal("格式异常应报错")
	}
}
