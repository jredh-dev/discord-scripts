# discord-scripts

Personal automation scripts for privacy and data management on Discord.

## Scripts

### 🌐 Browser Console Script (Recommended)

**File:** `browser-scripts/wipe-discord-messages-console.js`

The easiest way to delete your Discord messages - just paste into your browser console!

**How to use:**
1. Open Discord in your web browser
2. Navigate to the channel/DM you want to clean
3. Press **F12** (or Cmd+Option+I on Mac) to open Developer Tools
4. Click the **Console** tab
5. Copy the contents of `browser-scripts/wipe-discord-messages-console.js`
6. Paste into the console and press **Enter**
7. Watch as it automatically wipes and deletes your messages

**Features:**
- ✅ No installation required
- ✅ Works directly in your browser
- ✅ No external tools or dependencies
- ✅ Real-time progress logging
- ✅ Automatic scrolling to find older messages
- ✅ Wipe-then-delete (edits to blank, then removes)

### 🤖 Puppeteer Automation Script

**File:** `scripts/wipe-discord-messages.js`

Automated browser script using Puppeteer (requires Node.js).

**Features:**
- ✅ Full automation with Puppeteer
- ✅ Progress tracking with visual progress bar
- ✅ Configurable message limits
- ✅ CLI arguments for non-interactive mode
- ✅ Processes messages across any channel/server/DM

## Installation

### For Browser Console Script (Recommended)

No installation needed! Just:
1. Clone or download the repository
2. Open `browser-scripts/wipe-discord-messages-console.js`
3. Copy the contents
4. Paste into Discord's browser console

### For Puppeteer Script

```bash
# Clone repository
git clone https://github.com/jredh-dev/discord-scripts.git
cd discord-scripts

# Install dependencies
npm install
```

## Usage

### Interactive Mode (with prompts)

```bash
npm run wipe-messages
```

**Steps:**
1. Script launches a Chrome browser window
2. Log in to Discord manually in the browser
3. Navigate to the channel you want to clean (or provide URL when prompted)
4. Set a message limit (0 for unlimited)
5. Confirm to start the wipe-delete process

### Non-Interactive Mode (automation)

```bash
# Delete all messages without prompts
npm run wipe-auto

# Or use CLI arguments directly
node scripts/wipe-discord-messages.js --auto
node scripts/wipe-discord-messages.js --auto --limit 100
node scripts/wipe-discord-messages.js --auto --channel "https://discord.com/channels/..."
```

**CLI Options:**
- `--auto` / `-y` - Skip all prompts and run automatically
- `--channel <url>` / `-c <url>` - Discord channel URL to process
- `--limit <num>` / `-l <num>` - Maximum messages to delete (0 for unlimited)
- `--keep-open` / `-k` - Keep browser open after completion
- `--help` / `-h` - Show help

**Example:**
```bash
$ npm run wipe-messages

🚀 Launching browser...
🌐 Navigating to Discord...
⏳ Please log in to Discord in the browser window...

Enter Discord channel URL (or press Enter to use current page): 
Max messages to delete (0 for unlimited): 100
⚠️  This will WIPE and DELETE your messages. Continue? › Yes

🔍 Scanning for your messages...
Progress |████████████████████| 100/100 messages wiped & deleted

✅ Complete! Processed 100 messages.
```

## How It Works

The script uses [Puppeteer](https://pptr.dev/) to automate browser interactions:

1. **Launches Chrome** in non-headless mode (visible)
2. **Waits for manual login** (you log in normally)
3. **Scans messages** in the current channel
4. **For each message**:
   - Hovers to reveal actions menu
   - Clicks "Edit" → replaces text with space → saves
   - Clicks "Delete" → confirms deletion
5. **Scrolls up** to load older messages
6. **Repeats** until limit reached or no more messages found

## Security & Privacy

- ✅ **No token stealing** - You log in manually, no credentials stored
- ✅ **ToS compliant** - Uses browser automation, not unofficial APIs
- ✅ **Open source** - AGPL-3.0 licensed, audit the code yourself
- ✅ **Local execution** - Runs entirely on your machine

## Limitations

- **Rate limiting**: Discord may slow down requests if you delete too fast
- **Selector changes**: Discord UI updates may break selectors (will need updates)
- **Large channels**: Processing thousands of messages takes time
- **Partial deletion**: Some messages may fail to delete (permissions, etc.)

## Troubleshooting

**Script can't find messages:**
- Update the `SELECTORS` object in the script (Discord changed their UI)
- Check browser console for errors

**Messages delete but don't wipe:**
- Edit timeout may be too short, increase wait times in `wipeAndDeleteMessage()`

**Browser closes immediately:**
- Check for errors in terminal output
- Ensure Node.js 18+ is installed

## Disclaimer

This tool is for personal use only. Automating actions on Discord may be against their Terms of Service depending on usage. Use at your own risk. The author is not responsible for any account actions taken by Discord.

## License

AGPL-3.0 - see [LICENSE](LICENSE)

## Contributing

Issues and pull requests welcome! Please ensure any contributions maintain the AGPL-3.0 license and privacy-first principles.