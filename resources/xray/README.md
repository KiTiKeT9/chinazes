# Xray-core binary

Place the Xray executable for your platform here:

- Windows: `xray.exe`
- Linux: `xray`
- macOS: `xray`

Optionally add GeoIP / GeoSite databases next to it:

- `geoip.dat`
- `geosite.dat`

Download latest release from:
https://github.com/XTLS/Xray-core/releases

Example (Windows, PowerShell):

```powershell
# From project root:
$dest = "resources/xray"
Invoke-WebRequest https://github.com/XTLS/Xray-core/releases/latest/download/Xray-windows-64.zip -OutFile xray.zip
Expand-Archive xray.zip -DestinationPath $dest -Force
Remove-Item xray.zip
```

The app reads the binary from this folder in dev and from the
`resources/xray` folder inside the packaged build in production.
