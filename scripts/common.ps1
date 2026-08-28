#Requires -Version 5.1
# 供各构建/清理脚本 dot-source 的公共函数

function Format-Duration([TimeSpan]$Elapsed) {
  if ($Elapsed.TotalHours -ge 1) {
    return ('{0}小时{1}分{2}.{3}秒' -f [int]$Elapsed.TotalHours, $Elapsed.Minutes, $Elapsed.Seconds, [int]($Elapsed.Milliseconds / 100))
  }
  if ($Elapsed.TotalMinutes -ge 1) {
    return ('{0}分{1}.{2}秒' -f [int]$Elapsed.TotalMinutes, $Elapsed.Seconds, [int]($Elapsed.Milliseconds / 100))
  }
  return ('{0}.{1}秒' -f $Elapsed.Seconds, [int]($Elapsed.Milliseconds / 100))
}

function Write-Elapsed([string]$Label, [TimeSpan]$Elapsed) {
  Write-Host ("{0}: {1}" -f $Label, (Format-Duration $Elapsed)) -ForegroundColor Cyan
}
