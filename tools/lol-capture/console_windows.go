//go:build windows

package main

import (
	"os"
	"syscall"
	"unsafe"
)

// Windows 控制台中文显示：
// 国服 Windows 控制台默认代码页是 GBK(936)，本程序输出 UTF-8，直接写会乱码。
// 仅设 SetConsoleOutputCP(65001) 在部分 Windows 版本上仍不可靠（UTF-8 经 WriteFile
// 写控制台有已知问题）。最稳的做法是把字符串转成 UTF-16，用 WriteConsoleW 直接写控制台，
// 完全绕开代码页。当 stdout 被重定向到文件/管道时（GetConsoleMode 失败）回退到普通字节写。
var (
	kernel32           = syscall.NewLazyDLL("kernel32.dll")
	procWriteConsoleW  = kernel32.NewProc("WriteConsoleW")
	procGetConsoleMode = kernel32.NewProc("GetConsoleMode")
)

func init() {
	const cpUTF8 = 65001
	// 尽力而为：即使失败，consoleWrite 走 WriteConsoleW 仍能正确显示。
	_, _, _ = kernel32.NewProc("SetConsoleOutputCP").Call(uintptr(cpUTF8))
	_, _, _ = kernel32.NewProc("SetConsoleCP").Call(uintptr(cpUTF8))
}

// consoleWrite 把 s 写到控制台（UTF-16，不受代码页影响）；非控制台则按 UTF-8 字节写。
func consoleWrite(s string) {
	h, err := syscall.GetStdHandle(syscall.STD_OUTPUT_HANDLE)
	if err != nil || h == syscall.InvalidHandle {
		_, _ = os.Stdout.WriteString(s)
		return
	}
	var mode uint32
	if r, _, _ := procGetConsoleMode.Call(uintptr(h), uintptr(unsafe.Pointer(&mode))); r == 0 {
		// 不是真正的控制台（重定向到文件/管道），按 UTF-8 原样写。
		_, _ = os.Stdout.WriteString(s)
		return
	}
	u16, err := syscall.UTF16FromString(s)
	if err != nil {
		_, _ = os.Stdout.WriteString(s)
		return
	}
	// UTF16FromString 会追加一个 NUL 终止符，写入时排除它。
	n := len(u16) - 1
	if n <= 0 {
		return
	}
	var written uint32
	_, _, _ = procWriteConsoleW.Call(
		uintptr(h),
		uintptr(unsafe.Pointer(&u16[0])),
		uintptr(n),
		uintptr(unsafe.Pointer(&written)),
		0,
	)
}
