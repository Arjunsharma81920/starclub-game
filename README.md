# StarClub Color Game

Multi-screen real-time web app similar to color prediction / WinGo style games.  
Built with **Node.js + Express + Socket.IO** (backend) and **vanilla HTML/CSS/JS** (frontend), ready to wrap as an Android APK via Capacitor.

## Run locally

```bash
cd D:\aal-tag-use-CSS\Game   # or your project path
npm install
npm start
```

Open `http://localhost:3000` in browser.

## Deploy to Render (recommended free hosting)

1. **Push to GitHub**

   ```bash
   git init
   git add .
   git commit -m "StarClub color game initial"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/starclub-game.git
   git push -u origin main
   ```

2. **Create Render service**

   - Go to `https://render.com` and sign in with GitHub.
   - Click **New → Web Service** and pick your `starclub-game` repo.
   - Settings:
     - Environment: **Node**
     - Build Command: `npm install`
     - Start Command: `npm start`
     - Root Directory: leave empty.
   - Click **Create Web Service** and wait for deploy.

3. **Get your public URL**

   After deploy, Render gives you a URL like:

   `https://starclub-game.onrender.com`

   Share/open this link on your phone to play the game.

## Build Android APK (Capacitor)

1. Install Capacitor + Android dependencies:

   ```bash
   npm install @capacitor/core @capacitor/cli @capacitor/android --save
   ```

2. Sync web app to native project:

   ```bash
   npx cap sync android
   npm run cap:copy
   npm run cap:open-android
   ```

3. In Android Studio:

   - Make sure AGP version is compatible (e.g. `com.android.tools.build:gradle:8.12.0`).
   - Use **Build → Build Bundle(s) / APK(s) → Build APK(s)** to generate `app-debug.apk`.

