; ================================================================
; KINOSTRA Desktop — NSIS Installer (dikompilasi native tanpa wine)
; ================================================================
Unicode true
ManifestDPIAware true

!define APPNAME "KINOSTRA"
!define APPVERSION "2.0.0"
!define COMPANY "KINOSTRA"
!define EXEFILE "KINOSTRA.exe"
!define UNINST "Uninstall KINOSTRA.exe"
!define REGKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\{D4F5E9C2-1B7A-4E3F-9C8D-KINOSTRA20}"

Name "${APPNAME} — Suite Video Otonom"
OutFile "..\dist_out\KINOSTRA-Setup-2.0.0.exe"
InstallDir "$LOCALAPPDATA\Programs\KINOSTRA"
InstallDirRegKey HKCU "${REGKEY}" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma
VIProductVersion "2.0.0.0"
VIAddVersionKey /LANG=1033 "ProductName" "KINOSTRA"
VIAddVersionKey /LANG=1033 "FileDescription" "KINOSTRA Setup — Suite Video Otonom"
VIAddVersionKey /LANG=1033 "FileVersion" "2.0.0.0"
VIAddVersionKey /LANG=1033 "ProductVersion" "2.0.0.0"
VIAddVersionKey /LANG=1033 "CompanyName" "KINOSTRA"
VIAddVersionKey /LANG=1033 "LegalCopyright" "MIT License"

!include "MUI2.nsh"
!define MUI_ICON "..\build\icon.ico"
!define MUI_UNICON "..\build\icon.ico"
!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXEFILE}"
!define MUI_FINISHPAGE_RUN_TEXT "Jalankan KINOSTRA sekarang"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Bahasa: Indonesia dulu, Inggris cadangan
!insertmacro MUI_LANGUAGE "Indonesian"
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "..\dist_out\win-unpacked\*.*"

  ; shortcut desktop + start menu
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXEFILE}"
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\${EXEFILE}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Uninstall ${APPNAME}.lnk" "$INSTDIR\${UNINST}"

  ; uninstaller + registry (Apps & Features)
  WriteUninstaller "$INSTDIR\${UNINST}"
  WriteRegStr HKCU "${REGKEY}" "DisplayName" "${APPNAME} — Suite Video Otonom"
  WriteRegStr HKCU "${REGKEY}" "DisplayVersion" "${APPVERSION}"
  WriteRegStr HKCU "${REGKEY}" "Publisher" "${COMPANY}"
  WriteRegStr HKCU "${REGKEY}" "DisplayIcon" "$INSTDIR\${EXEFILE}"
  WriteRegStr HKCU "${REGKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${REGKEY}" "UninstallString" "$INSTDIR\${UNINST}"
  WriteRegStr HKCU "${REGKEY}" "QuietUninstallString" "$INSTDIR\${UNINST} /S"
  WriteRegDWORD HKCU "${REGKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${REGKEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${REGKEY}" "EstimatedSize" 190000
SectionEnd

Section "Uninstall"
  RMDir /r "$INSTDIR"
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  DeleteRegKey HKCU "${REGKEY}"
SectionEnd
