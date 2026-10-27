## Environment
- OS: Windows. Shell: PowerShell. Unix tools (tail, head, grep, sed, awk, cat) are NOT available in the shell.
- For searching and reading files, use opencode's built-in tools (grep, glob, read) instead of shell commands.
- In the shell, use PowerShell equivalents: Select-String (grep), Select-Object -Last/-First n (tail/head), Get-Content (cat).
- Run commands directly; do not wrap in `cmd /c` or nested `powershell -Command`.
- If a command fails because a tool is missing, don't retry variations of it. Change approach.