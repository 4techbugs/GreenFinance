# Android app

The Android app opens `https://greenfinance.4techbugs.in` automatically. The
website and its backend must be deployed and reachable at that URL; the APK
does not contain Node.js or SQL Server. The app's API requests use the same
website origin automatically.

## Build a debug APK

Install Node.js, Android Studio with the Android SDK, and Java 21. In
PowerShell, point Gradle at Android Studio's bundled Java runtime and the
Android SDK (adjust the Java path if Android Studio is installed elsewhere),
then install npm dependencies and build:

```powershell
$env:JAVA_HOME = "$env:ProgramFiles\Android\Android Studio\jbr"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
npm install
npm run build:apk
```

The debug APK is created at
`android/app/build/outputs/apk/debug/app-debug.apk`.

The APK opens the live portal at `https://greenfinance.4techbugs.in`. Deploy
the matching web files from `Green-Finance-Web-Fix.zip` as described in
`WEB-FIX-DEPLOYMENT.md` to update mobile layouts and menu behavior on the live
portal; rebuilding the APK alone does not update remote website files.
