# Mosiqi Editor & Performance Evaluation

Based on the VR Fixer pipeline outlined in your `Discussion.md` and your strict requirements for performance and low resource consumption, we must aggressively evaluate the Editor Engine.

If we naively implement the editor, Mosiqi will freeze computers, bloat hard drives, and crash due to out-of-memory errors. Here is the technical breakdown of the hurdles and how we engineer the solutions *before* writing any code.

---

## Hurdle 1: The VR "Guess-Work" CPU Melt

**The Plan:** The user uploads a broken VR video. Mosiqi automatically generates 4 or 5 different projection fixes (Fisheye, 180 to Flat, etc.) and shows a grid of previews for the user to visually confirm.
**The Edge Case:** If the uploaded video is an 8K HEVC file, running 5 concurrent `ffmpeg` filter commands on it will instantly pin the CPU to 100%, max out the RAM, and freeze the app. Generating the previews could take minutes instead of seconds.

**The Engineering Solution (The Proxy Step):**
We must never run multiple complex filters on the original 4K/8K source file for previews.
1.  **Step 1 (Extract Proxy):** Rust runs one simple command to extract a single 2-second clip from the middle of the video, instantly downscaling it to a tiny resolution (e.g., 480p).
2.  **Step 2 (Apply Filters):** Rust runs the 5 different VR projection filters *on the 480p proxy clip*.
3.  **Result:** Generating 5 previews takes 2 seconds instead of 2 minutes, and CPU usage stays incredibly low. The user selects the correct preview, and *only then* do we apply that specific filter to the original 4K file.

---

## Hurdle 2: Storage Bloat & Timeline Memory Leaks

**The Plan:** Generate proxy frames (thumbnails) for the timeline so the user can scrub through videos flawlessly.
**The Edge Case:** If a user imports a 2-hour movie, generating a JPEG for every second creates 7,200 image files. 
*   **Storage Problem:** This will eat gigabytes of temporary hard drive space.
*   **Memory Problem:** Loading 7,200 `<img>` tags into React will crash the V8 JavaScript engine (Out of Memory).

**The Engineering Solution (Virtualized Sprite Sheets & Temp Cleanup):**
1.  **Sprite Sheets:** Instead of 7,200 individual JPEGs, Rust commands `ffmpeg` to generate a "Sprite Sheet" (e.g., a 10x10 grid of thumbnails combined into a single, highly compressed WebP file). This reduces storage overhead by 90%.
2.  **Canvas Timeline Virtualization:** The React timeline will use a `<canvas>` element to draw the timeline. It will mathematically calculate which thumbnails should be visible on the screen and *only* load and draw those specific frames. RAM usage remains flat (under 50MB) regardless of whether the video is 10 minutes or 10 hours long.
3.  **Aggressive Garbage Collection:** Rust manages a strict `%TEMP%/mosiqi_cache` directory. Every time Mosiqi closes, Rust automatically purges the cache, ensuring the app leaves a zero-storage footprint.

---

## Hurdle 3: Zombie Processes (The Silent Battery Killer)

**The Plan:** Rust handles all heavy lifting via the Universal Job System (calling FFmpeg).
**The Edge Case:** A user starts a massive AV1 conversion job. Halfway through, they change their mind and click the "X" to close Mosiqi. The React UI closes, but the background `ffmpeg.exe` process is orphaned. It becomes a "zombie" process, secretly running in the background and draining the user's laptop battery to zero.

**The Engineering Solution (Strict Process Handles):**
The Rust Job Queue must maintain a master registry of every active Process ID (PID). 
We must hook into Tauri's `WindowEvent::CloseRequested` lifecycle event. Before Mosiqi is allowed to close, Rust iterates through the registry and aggressively sends a `kill()` signal to every active `ffmpeg` child process, ensuring a clean, safe exit.

---

## Summary of the Editor Architecture
By implementing **Proxy-First Processing**, **Sprite Sheet Virtualization**, and **Aggressive Process Management**, the Mosiqi Editor will feel incredibly fast, lightweight, and professional, completely avoiding the catastrophic performance pitfalls of standard electron-based media apps.
