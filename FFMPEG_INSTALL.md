# FFmpeg Installation Instructions (Windows)

To run the Zmare Stream Service locally, you need FFmpeg installed and added to your system PATH.

1. **Download**: Visit [gyan.dev FFmpeg builds](https://www.gyan.dev/ffmpeg/builds/) and download `ffmpeg-git-full.7z` or `ffmpeg-master-latest-win64-gpl.zip`.
2. **Extract**: Extract the folder to a permanent location (e.g., `C:\ffmpeg`).
3. **Add to PATH**:
   - Open the **Start Menu**, search for "Environment Variables", and select "Edit the system environment variables".
   - Click **Environment Variables**.
   - Under "System variables", find **Path** and click **Edit**.
   - Click **New** and paste the path to the `bin` folder (e.g., `C:\ffmpeg\bin`).
   - Click **OK** on all windows.
4. **Verify**: Open a new PowerShell window and run `ffmpeg -version`.

Once installed, the backend will be able to process and push your streams to YouTube!
