# Deploy the Green Finance web fixes

The Capacitor app opens the live website at
`https://greenfinance.4techbugs.in`, so fixes to the menu, search, logo, and
startup performance must also be deployed to the website.

`Green-Finance-Web-Fix.zip` contains the updated web and server files,
including labeled card layouts for mobile data tables. Before deploying:

1. Back up the matching files on the hosting server.
2. Extract the archive and replace only the files it contains. Preserve the
   server's existing `.env` and hosting configuration.
3. Restart the Node.js application if the hosting platform does not restart it
   automatically.
4. Reload the website and check the logo, mobile menu, mobile card layouts,
   search, and login.

The updated APK keeps connecting to the same website URL. Reinstalling the APK
is only needed to update the Android launcher icon.
