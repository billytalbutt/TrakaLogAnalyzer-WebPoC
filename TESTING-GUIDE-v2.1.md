# Testing Guide - Traka Log Analyzer v2.1

This guide will help you test all the new features added in version 2.1.

---

## 🧪 Test 1: Clear All Logs Button

### Prerequisites
- No files loaded initially

### Steps
1. Open `index.html` in a web browser
2. Load 2-3 log files (any `.log` or `.txt` files)
3. Navigate to the "Log Viewer" page
4. Click the red "Clear All" button in the toolbar

### Expected Results
- ✅ Confirmation modal appears with:
  - Warning icon and title
  - Count of files to be cleared
  - List of what will be removed
  - Warning message
  - "Cancel" and "Yes, Clear All Logs" buttons
- ✅ Click "Cancel" - modal closes, no changes
- ✅ Click "Yes, Clear All Logs":
  - Modal closes
  - All files removed
  - Stats reset to 0
  - Navigates to Home page
  - Success toast notification appears
  - No errors in browser console

### Test Edge Cases
- ✅ Click "Clear All" when no files loaded → Shows "No files loaded" toast
- ✅ Clear logs while in Compare view → Works correctly
- ✅ Clear logs with active Live Tail → Live Tail stops automatically

---

## 🧪 Test 2: Config File Support

### Prerequisites
- Create a test `.cfg` file with this content:

```ini
# Traka Configuration File
# Last modified: 2024-01-19

[General]
ApplicationName=TrakaWEB
Version=8.5.0
LicenseKey=XXXX-YYYY-ZZZZ

[Database]
Server=localhost
Port=1433
Database=TrakaDB
ConnectionTimeout=30

; Network Settings
[Network]
EnableSSL=true
Port=443
MaxConnections=100

[Logging]
LogLevel=Info
LogPath=C:\Logs\
MaxFileSize=10MB
```

### Steps
1. Open the Log Analyzer
2. Drag and drop the `.cfg` file onto the drop zone
3. Verify file loads successfully
4. Navigate to Log Viewer
5. Select the config file from dropdown

### Expected Results
- ✅ File loads with success toast showing "config file"
- ✅ Purple "CONFIG" badge appears next to filename in file list
- ✅ Config file excluded from issue detection (no false errors)
- ✅ Syntax highlighting applied:
  - `[Section]` headers in orange
  - `# comments` in gray italic
  - `Key=Value` pairs with key in blue
- ✅ Config file appears in Compare view with badge
- ✅ Can mix config files and log files in Compare view

### Test Edge Cases
- ✅ Load multiple config files
- ✅ Remove config file - works correctly
- ✅ Compare config files side-by-side
- ✅ Search within config files

---

## 🧪 Test 3: Time Synchronization Feature

### Prerequisites
- Create 3 test log files with timestamps:

**business-engine.log:**
```
2024-01-19 12:25:27 [INFO] Business Engine started
2024-01-19 12:25:28 [INFO] Database connection established
2024-01-19 12:25:30 [ERROR] Failed to process booking request
2024-01-19 12:25:31 [ERROR] Cabinet communication timeout
2024-01-19 12:25:35 [INFO] Retry attempt 1
```

**comms-engine.log:**
```
2024-01-19 12:25:27 [INFO] Comms Engine initialized
2024-01-19 12:25:29 [INFO] Listening on port 8080
2024-01-19 12:25:30 [WARN] Cabinet 05 not responding
2024-01-19 12:25:31 [ERROR] Communication channel lost
2024-01-19 12:25:33 [INFO] Attempting reconnection
```

**integration-engine.log:**
```
2024-01-19 12:25:26 [INFO] Integration Engine v8.5
2024-01-19 12:25:28 [INFO] Connected to OnGuard
2024-01-19 12:25:30 [ERROR] Access denied for user JSmith
2024-01-19 12:25:31 [WARN] Invalid badge number
2024-01-19 12:25:36 [INFO] Request completed
```

### Steps
1. Load all 3 log files
2. Navigate to "Compare" page
3. Verify all 3 files visible side-by-side
4. Click the "Time Sync" button (clock icon)

### Expected Results
- ✅ Button turns orange/active state
- ✅ Info panel appears below toolbar explaining feature
- ✅ All timestamped lines become clickable (cursor changes)
- ✅ Click on the `12:25:30` error in Business Engine:
  - Lines at `12:25:30` highlighted in ALL files
  - Lines from `12:25:25` to `12:25:35` highlighted (±5 seconds)
  - Beautiful orange glow animation plays
  - All panels scroll to show highlighted area
  - Status shows: "Synced to: 2024-01-19 12:25:30"
  - Status shows count: "X matching lines found"
  - Success toast appears
- ✅ Click different timestamp → Previous highlights clear, new ones appear
- ✅ Click "Time Sync" again → Disables feature, highlights clear

### Advanced Testing
1. **Multi-Format Timestamps:**
   - Test with different date formats (DD/MM/YYYY, MM-DD-YYYY)
   - Test with time-only timestamps `[14:25:30]`
   - Test with milliseconds `12:25:30.456`

2. **Edge Cases:**
   - Click line without timestamp → Warning toast
   - Enable with only 1 file loaded → Warning toast
   - Sync with config files loaded → Works (if timestamps present)
   - Sync with 6 files → All files sync correctly

3. **Visual Verification:**
   - Verify orange highlight stands out clearly
   - Verify animation is smooth
   - Verify scroll position centers the matches
   - Verify highlights persist until new sync or disable

---

## 🧪 Test 4: Integration Testing

### Test All Features Together

1. **Start Fresh:**
   - Open application
   - Load 3 log files and 1 config file
   - Verify all display correctly

2. **Use Time Sync:**
   - Navigate to Compare
   - Enable Time Sync
   - Sync to a specific timestamp
   - Verify highlights work across logs (not config)

3. **Clear and Reload:**
   - Navigate to Log Viewer
   - Click "Clear All"
   - Confirm modal works
   - Load new files
   - Verify everything resets correctly

4. **Mix Features:**
   - Load logs and configs
   - Use Time Sync
   - Use Highlight Differences
   - Use Search
   - Verify no conflicts between features

---

## 📊 Expected Behavior Summary

| Feature | Location | Action | Expected Result |
|---------|----------|--------|-----------------|
| Clear All | Log Viewer toolbar | Click button | Confirmation modal, then clear all data |
| Config Files | File load | Drop .cfg file | Purple badge, syntax highlighting |
| Time Sync | Compare page | Click timestamped line | All files sync to ±5s of timestamp |
| Disable Sync | Compare page | Click Time Sync again | Highlights clear, feature disables |

---

## 🐛 Common Issues and Solutions

### Issue: Config file not highlighting
- **Solution:** Check file has `.cfg` extension
- **Solution:** Verify format matches `key=value`, `[section]`, or `# comment`

### Issue: Time Sync not working
- **Solution:** Ensure 2+ files loaded
- **Solution:** Verify lines have timestamps in supported formats
- **Solution:** Check Time Sync button is active (orange)

### Issue: Clear All not showing confirmation
- **Solution:** Check modal isn't hidden behind other elements
- **Solution:** Verify no JavaScript errors in console

---

## ✅ Checklist

Use this checklist to verify all features:

- [ ] Clear All button appears in toolbar
- [ ] Clear All shows confirmation modal
- [ ] Clear All successfully removes all files
- [ ] .cfg files load and show CONFIG badge
- [ ] Config syntax highlighting works
- [ ] Config files excluded from issue detection
- [ ] Time Sync button appears in Compare toolbar
- [ ] Time Sync enables/disables correctly
- [ ] Time Sync info panel shows/hides
- [ ] Clicking timestamped line highlights matching lines
- [ ] Highlights span ±5 seconds correctly
- [ ] Multiple timestamp formats supported
- [ ] Status display shows sync info
- [ ] All panels scroll to matches
- [ ] Orange glow animation plays smoothly
- [ ] No console errors throughout testing
- [ ] Beautiful UI maintained throughout
- [ ] Toast notifications appear for all actions
- [ ] All features work together without conflicts

---

## 🎉 Success Criteria

All tests pass when:
1. ✅ No JavaScript errors in console
2. ✅ All UI elements render correctly
3. ✅ All animations play smoothly
4. ✅ All toast notifications appear
5. ✅ Features work independently and together
6. ✅ Beautiful, consistent styling throughout
7. ✅ Responsive on different screen sizes
8. ✅ Professional user experience maintained

---

## 📝 Manual Testing Notes

**Test Date:** _______________  
**Tested By:** _______________  
**Browser:** Chrome / Firefox / Edge (circle one)  
**OS:** Windows / Mac / Linux (circle one)

**Notes:**
_______________________________________
_______________________________________
_______________________________________

**Issues Found:**
_______________________________________
_______________________________________
_______________________________________

**Status:** ☐ Pass ☐ Fail ☐ Needs Review

---

**Happy Testing! 🚀**
