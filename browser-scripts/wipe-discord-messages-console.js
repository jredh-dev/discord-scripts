/**
 * Discord Message Wipe-Delete Console Script
 * 
 * Copy and paste this entire script into Discord's browser console (F12 → Console tab)
 * to automatically wipe and delete all your messages in the current channel.
 * 
 * How to use:
 * 1. Open Discord in your browser
 * 2. Navigate to the channel/DM you want to clean
 * 3. Press F12 to open Developer Tools
 * 4. Go to the "Console" tab
 * 5. Paste this entire script and press Enter
 * 6. Watch as it processes your messages
 * 
 * License: AGPL-3.0
 */

(async function() {
  console.log('🚀 Discord Message Wiper - Starting...');
  console.log('⚠️  This will wipe and delete ALL your messages in this channel.');
  console.log('⚠️  Press Ctrl+C in console to stop at any time.\n');

  let processed = 0;
  let failed = 0;
  const processedIds = new Set();

  // Utility functions
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  const scrollToTop = () => {
    const scroller = document.querySelector('[class*="scrollerInner-"]');
    if (scroller) {
      scroller.scrollTop = 0;
    }
  };

  const findUserMessages = () => {
    // Find all message elements
    const messages = document.querySelectorAll('[id^="chat-messages-"]');
    const userMessages = [];

    messages.forEach(msg => {
      // Check if message has action buttons (indicates it's your message)
      const hasActions = msg.querySelector('[class*="buttonContainer-"]');
      if (hasActions && !processedIds.has(msg.id)) {
        userMessages.push(msg);
      }
    });

    return userMessages;
  };

  const wipeAndDeleteMessage = async (messageElement) => {
    try {
      // Hover to show action buttons
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(300);

      // Simulate hover
      const mouseEnterEvent = new MouseEvent('mouseenter', { bubbles: true });
      messageElement.dispatchEvent(mouseEnterEvent);
      await sleep(300);

      // Find and click "More" button (three dots)
      const moreButton = messageElement.querySelector('[aria-label="More"]');
      if (!moreButton) {
        console.log('❌ Could not find More button');
        return false;
      }
      moreButton.click();
      await sleep(500);

      // Click "Edit" button
      const editButton = document.querySelector('[id^="message-actions-edit"]');
      if (editButton) {
        editButton.click();
        await sleep(500);

        // Find text area and replace with space
        const textArea = messageElement.querySelector('[class*="textArea-"][role="textbox"]');
        if (textArea) {
          // Clear and type space
          textArea.focus();
          textArea.textContent = ' ';
          
          // Trigger input event
          const inputEvent = new Event('input', { bubbles: true });
          textArea.dispatchEvent(inputEvent);
          await sleep(300);

          // Press Enter to save
          const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            bubbles: true
          });
          textArea.dispatchEvent(enterEvent);
          await sleep(1000); // Wait for edit to save
        }
      }

      // Now delete the message
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(300);
      
      const mouseEnterEvent2 = new MouseEvent('mouseenter', { bubbles: true });
      messageElement.dispatchEvent(mouseEnterEvent2);
      await sleep(300);

      const moreButton2 = messageElement.querySelector('[aria-label="More"]');
      if (moreButton2) {
        moreButton2.click();
        await sleep(500);

        const deleteButton = document.querySelector('[id^="message-actions-delete"]');
        if (deleteButton) {
          deleteButton.click();
          await sleep(500);

          // Confirm deletion - try multiple selectors for new and old Discord UI
          let confirmButton = document.querySelector('[type="submit"]');
          
          // Fallback to new Discord button format with data-mana-component
          if (!confirmButton) {
            const buttons = document.querySelectorAll('[data-mana-component="button"]');
            for (const btn of buttons) {
              const text = btn.textContent.trim();
              if (text === 'Delete' || text === 'Confirm') {
                confirmButton = btn;
                break;
              }
            }
          }
          
          // Additional fallback for buttons with specific class patterns
          if (!confirmButton) {
            const buttons = document.querySelectorAll('button[class*="button"]');
            for (const btn of buttons) {
              const text = btn.textContent.trim();
              if (text === 'Delete' || text === 'Confirm') {
                confirmButton = btn;
                break;
              }
            }
          }
          
          if (confirmButton) {
            confirmButton.click();
            await sleep(1000);
            return true;
          }
        }
      }

      return false;
    } catch (err) {
      console.error('❌ Error:', err.message);
      return false;
    }
  };

  // Main processing loop
  let consecutiveNoMessages = 0;
  const maxConsecutiveNoMessages = 3;

  console.log('🔍 Scanning for your messages...\n');

  while (consecutiveNoMessages < maxConsecutiveNoMessages) {
    // Find messages
    const messages = findUserMessages();

    if (messages.length === 0) {
      consecutiveNoMessages++;
      console.log(`⏳ No new messages found (${consecutiveNoMessages}/${maxConsecutiveNoMessages}). Scrolling up...`);
      scrollToTop();
      await sleep(2000);
      continue;
    }

    consecutiveNoMessages = 0;

    // Process each message
    for (const msg of messages) {
      console.log(`🗑️  Processing message ${msg.id}...`);
      
      const success = await wipeAndDeleteMessage(msg);
      
      if (success) {
        processedIds.add(msg.id);
        processed++;
        console.log(`✅ Deleted message ${processed}`);
      } else {
        failed++;
        console.log(`❌ Failed to delete message`);
      }

      // Rate limiting - wait between messages
      await sleep(1500);
    }

    // Scroll up to find more messages
    scrollToTop();
    await sleep(2000);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Complete!');
  console.log(`   Processed: ${processed} messages`);
  console.log(`   Failed: ${failed} messages`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
})();
