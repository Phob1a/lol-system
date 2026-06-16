package main

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// uploadSummary POST summary JSON 到服务器导入入口；非 2xx 返回 error。
func uploadSummary(server, token string, summaryJSON []byte) error {
	url := strings.TrimRight(server, "/") + "/api/tournament/imports"
	req, err := http.NewRequest("POST", url, bytes.NewReader(summaryJSON))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("服务器返回 HTTP %d：%s", resp.StatusCode, truncate(string(body), 300))
	}
	return nil
}
