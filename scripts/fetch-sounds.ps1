# 从上游仓库 aklnaaw/dsh-xiaoke-widget 下载小克的音效，放进 sounds/。
# 这些音效按上游说明「原样提供」，本仓库不再分发，只在你本机下载。
# 用法（在仓库根目录）：  powershell -ExecutionPolicy Bypass -File scripts\fetch-sounds.ps1
# 需要 ffmpeg 才能合成戳一下的「吱」声；没有也不影响其它音效。

$ErrorActionPreference = 'Stop'
$base = 'https://raw.githubusercontent.com/aklnaaw/dsh-xiaoke-widget/8e2a207bfc9ae3983168dcc847e54734771bce67/assets'
$sounds = Join-Path $PSScriptRoot '..\sounds'
New-Item -ItemType Directory -Force $sounds | Out-Null

$files = @{
  'task-end-a.wav'      = 'task-end.wav'
  'approve-default.wav' = 'approve.wav'
  'ask-default.wav'     = 'ask.wav'
  'cost-default.wav'    = 'cost.wav'
  'Ya1.mp3'             = 'Ya1.mp3'
  'Ya2.mp3'             = 'Ya2.mp3'
}
foreach ($name in $files.Keys) {
  $to = Join-Path $sounds $files[$name]
  Write-Host "下载 $name -> sounds\$($files[$name])"
  Invoke-WebRequest -UseBasicParsing -Uri "$base/$name" -OutFile $to
}

# 戳一下的「吱」：Ya1（按下）开头，0.3 秒后叠上 Ya2（松开）。
$ya1 = Join-Path $sounds 'Ya1.mp3'
$ya2 = Join-Path $sounds 'Ya2.mp3'
$squeak = Join-Path $sounds 'squeak.wav'
if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
  & ffmpeg -v error -y -i $ya1 -i $ya2 -filter_complex '[1]adelay=300|300[b];[0][b]amix=inputs=2:duration=longest:normalize=0' -ar 48000 -ac 2 $squeak
  Write-Host '已合成 sounds\squeak.wav'
} else {
  Write-Host '未找到 ffmpeg：跳过「吱」声。装好 ffmpeg 后再运行一次本脚本即可。'
}
Remove-Item $ya1, $ya2
Write-Host '完成。在 Claude Code 里运行 /xiaoke reload，或开一个新会话。'
