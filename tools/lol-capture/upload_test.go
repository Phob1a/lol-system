package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestUploadSummarySuccess(t *testing.T) {
	var gotAuth, gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		w.WriteHeader(201)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()
	if err := uploadSummary(srv.URL, "tk", []byte(`{"gameId":123}`)); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotAuth != "Bearer tk" {
		t.Errorf("auth header = %q", gotAuth)
	}
	if !strings.Contains(gotBody, "gameId") {
		t.Errorf("body missing gameId: %q", gotBody)
	}
}

func TestUploadSummaryNon2xx(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
		w.Write([]byte(`{"error":"未授权"}`))
	}))
	defer srv.Close()
	if err := uploadSummary(srv.URL, "tk", []byte(`{}`)); err == nil {
		t.Fatal("expected error on 401")
	}
}
