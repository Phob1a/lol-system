//go:build !windows

package main

import "os"

// consoleWrite：非 Windows 平台直接按 UTF-8 字节写 stdout。
func consoleWrite(s string) {
	_, _ = os.Stdout.WriteString(s)
}
