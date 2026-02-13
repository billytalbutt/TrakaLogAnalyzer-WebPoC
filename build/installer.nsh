; ============================================================
;  Traka Log Analyzer — Custom NSIS Installer Macros
;  Branded welcome text and installer customisations.
; ============================================================

!macro customHeader
    !system "echo '  Traka Log Analyzer NSIS Build'"
!macroend

; Custom welcome page text
!macro preInit
    ; Set the window title
    !ifdef INSTALL_MODE_PER_ALL_USERS
        ; Per-machine install
    !endif
!macroend

!macro customInit
    ; Any custom initialisation code
!macroend

; Custom text for the finish page
!macro customInstall
    ; Post-install actions (shortcuts are handled by electron-builder config)
!macroend
