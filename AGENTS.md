<!-- For Opencode AI prompts run every session. After editing this file, restart Opencode for the changes to take effect. -->

## Environment
- NEVER run grep, head, tail, cat, sed, awk, or find in the shell. They do not exist on this machine.
- To search code, use the built-in grep/glob tools. To read files, use the built-in read tool.
- In the shell, use PowerShell equivalents: Select-String (grep), Select-Object -Last/-First n (tail/head), Get-Content (cat).
- Run commands directly; do not wrap in `cmd /c` or nested `powershell -Command`.
- If a command fails because a tool is missing, don't retry variations of it. Change approach.