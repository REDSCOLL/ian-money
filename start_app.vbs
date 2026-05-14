Set WshShell = CreateObject("WScript.Shell")
' Run the batch file hidden (0 = hidden window)
WshShell.Run "cmd /c start_app.bat", 0, False

' Wait for the server to initialize (adjust time if needed)
WScript.Sleep 6000

' Open the application in the default browser
WshShell.Run "http://localhost:5000"
