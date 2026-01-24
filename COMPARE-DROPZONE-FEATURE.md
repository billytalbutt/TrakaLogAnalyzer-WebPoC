# Intelligent Compare Page Drop Zone

**Feature:** Smart Multi-File Drag & Drop with Automatic Sorting

---

## 🎯 What It Does

When you drag and drop multiple log files onto the Compare page, they are automatically sorted in the optimal order for Traka troubleshooting:

### **Automatic Sorting Order:**
1. **Business Engine** (leftmost) - Most significant
2. **Comms Engine** (next)
3. **Integration Engine** (next)
4. **Plugin Logs** (rightmost) - CCure, Lenel, OnGuard, Symmetry, Secure
5. **Config Files** (if any)
6. **Other Files** (any unrecognized logs)

---

## 🎨 Visual Design

### Empty State (No Files Loaded)

```
┌─────────────────────────────────────────────────────────┐
│                                                           │
│                         📤                               │
│                                                           │
│           Drag & Drop Multiple Logs Here                 │
│     Drop Business, Comms, Integration, and Plugin logs   │
│  Files will be automatically sorted: Business → Comms → │
│                 Integration → Plugins                     │
│                                                           │
│                   [Or Browse Files]                       │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

### Hover/Drag Over State

```
┌═════════════════════════════════════════════════════════┐
║                      📤 (glowing)                        ║
║                                                          ║
║           Drop your files here!                          ║
║        (Orange glow, pulsing effect)                     ║
└═════════════════════════════════════════════════════════┘
```

---

## 🚀 How To Use

### Method 1: Drag & Drop (Recommended)
1. Navigate to **Compare** page
2. Select multiple log files from Windows Explorer
3. Drag them over the drop zone
4. Drop them
5. **Files automatically sort and load!**

### Method 2: Browse Files
1. Navigate to **Compare** page
2. Click **"Or Browse Files"** button
3. Select multiple files (Ctrl+Click or Shift+Click)
4. Click Open
5. **Files automatically sort and load!**

---

## 🧠 Intelligent Sorting Logic

### File Name Detection Patterns

**Business Engine:**
- `business`
- `businessengine`
- `business-engine`
- `business_engine`

**Comms Engine:**
- `comms`
- `commsengine`
- `comms-engine`
- `comms_engine`
- `communication`

**Integration Engine:**
- `integration`
- `integrationengine`
- `integration-engine`
- `integration_engine`

**Plugins (by type):**
- `ccure` → CCure Plugin
- `lenel` → Lenel Plugin
- `onguard` → OnGuard Plugin
- `symmetry` → Symmetry Plugin
- `secure` → Secure Plugin
- `plugin` → Generic Plugin

**Config Files:**
- `*.cfg` → Config (sorted after plugins)

---

## 📊 Example Scenarios

### Scenario 1: Standard 3-Engine Setup

**Drop these files:**
```
Integration-Engine.log
Business-Engine.log
Comms-Engine.log
```

**Result (left to right):**
```
┌───────────────┬───────────────┬───────────────┐
│ Business      │ Comms         │ Integration   │
│ Engine        │ Engine        │ Engine        │
└───────────────┴───────────────┴───────────────┘
```

### Scenario 2: Engines + OnGuard Plugin

**Drop these files:**
```
OnGuardService.log
Comms-Engine.log
Business-Engine.log
Integration-Engine.log
```

**Result (left to right):**
```
┌─────────┬─────────┬─────────┬─────────┐
│Business │ Comms   │Integrat.│OnGuard  │
│ Engine  │ Engine  │ Engine  │ Plugin  │
└─────────┴─────────┴─────────┴─────────┘
```

### Scenario 3: Mixed with Config

**Drop these files:**
```
Traka.cfg
Integration-Engine.log
Business-Engine.log
CCure-Plugin.log
```

**Result (left to right):**
```
┌─────────┬─────────┬─────────┬─────────┐
│Business │Integrat.│ CCure   │ Traka   │
│ Engine  │ Engine  │ Plugin  │ Config  │
└─────────┴─────────┴─────────┴─────────┘
```

---

## 💡 Benefits

### For Troubleshooting:
✅ **Left-to-Right Flow:** Mirrors the logical flow (Business → Comms → Integration → Plugins)  
✅ **Consistent Layout:** Always know where to look  
✅ **Time Savings:** No manual arranging needed  
✅ **Professional:** Automatic organization  

### For Time Sync:
✅ **Perfect Alignment:** Business Engine errors on the left  
✅ **Easy Correlation:** See impact flow across systems  
✅ **Logical Reading:** Natural left-to-right progression  

---

## 🎨 Visual Feedback

### Drag Over:
- Border changes to **orange**
- Background gets **orange glow**
- Icon becomes **brighter**
- Slight **scale animation** (1.02x)

### After Drop:
- **Toast notification**: "Files sorted: Business Engine → Comms Engine → Integration Engine"
- Files appear in correct order
- Ready for Time Sync!

---

## 🔧 Technical Details

### Sorting Algorithm:
```javascript
Priority Order (lower = leftmost):
1. Business Engine
2. Comms Engine  
3. Integration Engine
4. Plugins (CCure, Lenel, OnGuard, etc.)
5. Config files
6. Unknown files
```

### Case-Insensitive Matching:
- Works with any capitalization
- Handles hyphens, underscores, and spaces
- Matches common naming patterns

### Multiple File Support:
- No limit on number of files
- Grid adjusts automatically (1-6 files optimal)
- Scrolls if more than 6 files

---

## 📋 File Naming Best Practices

For best automatic sorting, use these naming patterns:

**Recommended:**
- ✅ `Business-Engine.log`
- ✅ `Comms-Engine.log`
- ✅ `Integration-Engine.log`
- ✅ `OnGuard-Plugin.log`

**Also Works:**
- ✅ `TrakaWEB_Business_Engine_2024.log`
- ✅ `commsengine-customer-abc.log`
- ✅ `integration.log`

**Will Be Sorted Last:**
- ⚠️ `log1.txt`
- ⚠️ `output.log`
- ⚠️ `debug.txt`

---

## 🎯 Workflow Example

### Typical Support Scenario:

1. **Customer sends ZIP file** with multiple logs
2. **Extract logs** to a folder
3. **Select all 3-4 log files** in Windows Explorer
4. **Drag to Compare page drop zone**
5. **Files auto-sort** in optimal order
6. **Enable Time Sync**
7. **Click error in Business Engine**
8. **See correlated events** in Comms, Integration, and Plugin logs
9. **Diagnose issue** quickly!

---

## ✨ Pro Tips

**Tip 1:** Drop all files at once for instant comparison  
**Tip 2:** Use Time Sync immediately after - files are already sorted optimally  
**Tip 3:** Business Engine is always leftmost - start your analysis there  
**Tip 4:** Plugins always on the right - check them last  
**Tip 5:** Config files load but don't affect log analysis  

---

## 🚫 What Doesn't Auto-Sort

The drop zone is **only active when no files are loaded**. 

- ✅ **Works:** Empty Compare page
- ❌ **Disabled:** When files already loaded (use "Add Files" button instead)

This prevents accidental re-sorting of your existing view.

---

## 🎉 Result

**Before:** Manual file selection and arrangement  
**After:** One drag-and-drop, perfectly organized!

```
Drop 4 files → Auto-sorted → Ready to analyze!
     ⏱️ 2 seconds total
```

---

**This feature makes the Compare page incredibly efficient for multi-engine troubleshooting!** 🚀
