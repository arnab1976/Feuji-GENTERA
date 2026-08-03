# Generate ~60s narration WAV for GENTERA journey video
Add-Type -AssemblyName System.Speech
$speak = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speak.Rate = 0
$speak.Volume = 100

$voices = $speak.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo }
$preferred = $voices | Where-Object { $_.Name -match 'Zira|Jenny|Aria|David|Mark' } | Select-Object -First 1
if ($preferred) { $speak.SelectVoice($preferred.Name) }

# ~140 words ≈ 55–60 seconds at Rate 0
$script = @"
Welcome to GENTERA. One click. Any cloud. Enterprise A I instantly.
GENTERA provisions and governs production-ready L L M and RAG ecosystems across hybrid and multi-cloud.
Phase one is the GENTERA Kit. Nine steps take you from intake to production.
Capture requirements, get A I recommendations, and review cost against your budget.
Generate Terraform, deploy through the execution engine, and monitor health.
Finish with audit and compliance, testing and Q A, then launch and operate.
Phase two is GENTERA FinOps. Continuously optimize cost with enterprise governance.
Review cost breakdown, apply A I recommendations, and track savings on the dashboard.
From intent to infrastructure to FinOps, GENTERA delivers an end-to-end Gen A I journey.
Multi-cloud, compliant, and FinOps ready. Start your GENTERA journey today.
"@

$out = "c:\Mintera\Mintera_repo\frontend\public\video_build\narration.wav"
$speak.SetOutputToWaveFile($out)
$speak.Speak($script)
$speak.Dispose()
Write-Host "Narration written: $out"
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $out
