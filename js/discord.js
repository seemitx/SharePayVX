/**
 * SharePay - Discord Webhook Notifications
 * ------------------------------------------------------------------
 * ส่งแจ้งเตือนสวยๆ (Discord Embed) เข้าช่องแชทของคุณ ทุกครั้งที่มี:
 *   - สร้างกลุ่มใหม่
 *   - เพิ่มค่าใช้จ่ายใหม่
 *   - มีคนบันทึกการชำระเงิน (settlement)
 *
 * วิธีติดตั้ง:
 *   1. ไปที่ Discord > ตั้งค่าช่อง (Channel) > Integrations > Webhooks > New Webhook
 *   2. คัดลอก "Webhook URL" ที่ได้ มาใส่ตรงตัวแปร WEBHOOK_URL ด้านล่าง
 *   3. เพิ่ม <script src="js/discord.js"></script> ในไฟล์ HTML ที่ต้องการ
 *      (ต้องอยู่ "หลัง" auth.js/storage.js/config.js และ "ก่อน" member.js)
 *
 * ไฟล์นี้ทำงานแบบ "ไม่บังคับ" — ถ้ายังไม่ใส่ WEBHOOK_URL จะแค่ log เตือนใน
 * console เฉยๆ ไม่ทำให้แอปพัง
 * ------------------------------------------------------------------
 */

const WEBHOOK_URL = 'https://discord.com/api/webhooks/1526526401933611048/90ds4OK1HqlV_1GE-5dr7ObNWZ1Ndvo4X_qNtKwH-eaJbja6aJva_yjNTO3XPTLrk4Om'; // 👈 วาง Discord Webhook URL ของคุณตรงนี้ เช่น 'https://discord.com/api/webhooks/xxxx/yyyy'

const BOT_USERNAME  = 'SharePay';
const BOT_AVATAR    = 'https://cdn-icons-png.flaticon.com/512/2830/2830284.png'; // ไอคอนกระเป๋าเงิน (เปลี่ยนเป็น URL โลโก้ของคุณเองได้)

const COLORS = {
  expense:    0x6366F1, // ม่วง-น้ำเงิน (โทนหลักของ SharePay)
  group:      0x10B981, // เขียว
  settlement: 0x22C55E, // เขียวสด
  warning:    0xF59E0B,
};

const Discord = {

  /** ส่ง payload ดิบไปยัง Discord Webhook */
  async send(payload) {
    if (!WEBHOOK_URL) {
      console.warn('[Discord] ยังไม่ได้ตั้งค่า WEBHOOK_URL ใน js/discord.js — ข้ามการแจ้งเตือน');
      return;
    }
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: BOT_USERNAME, avatar_url: BOT_AVATAR, ...payload }),
      });
      if (!res.ok) console.warn('[Discord] ส่งแจ้งเตือนไม่สำเร็จ, status:', res.status);
    } catch (err) {
      console.error('[Discord] เกิดข้อผิดพลาดตอนส่งแจ้งเตือน:', err);
    }
  },

  /** แจ้งเตือน: สร้างกลุ่มใหม่ */
  notifyNewGroup({ groupName, groupIcon = '👥', creatorName, memberCount = 1 }) {
    return this.send({
      embeds: [{
        title: `${groupIcon} สร้างกลุ่มใหม่แล้ว!`,
        description: `**${groupName}**`,
        color: COLORS.group,
        fields: [
          { name: '👤 ผู้สร้าง', value: creatorName, inline: true },
          { name: '👥 สมาชิก', value: `${memberCount} คน`, inline: true },
        ],
        thumbnail: { url: BOT_AVATAR },
        footer: { text: 'SharePay • หารง่าย จ่ายชัวร์' },
        timestamp: new Date().toISOString(),
      }],
    });
  },

  /** แจ้งเตือน: เพิ่มค่าใช้จ่ายใหม่ */
  notifyNewExpense({
    groupName, groupIcon = '👥',
    title, categoryLabel = 'อื่นๆ', categoryIcon = '📦',
    amount, paidByName, splitMemberNames = [], splitAmount = 0,
    note = '', date = '',
  }) {
    const money = (n) => `฿${Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const splitLines = splitMemberNames.length
      ? splitMemberNames.map(n => `• ${n} — ${money(splitAmount)}`).join('\n')
      : '-';

    return this.send({
      embeds: [{
        title: `${categoryIcon} เพิ่มค่าใช้จ่ายใหม่`,
        description: `**${title}**${note ? `\n📝 _${note}_` : ''}`,
        color: COLORS.expense,
        fields: [
          { name: '👥 กลุ่ม',      value: `${groupIcon} ${groupName}`, inline: true },
          { name: '💰 จำนวนเงิน',  value: money(amount),               inline: true },
          { name: '🏷️ หมวดหมู่',  value: categoryLabel,               inline: true },
          { name: '💳 ผู้จ่าย',    value: paidByName,                  inline: true },
          { name: '📅 วันที่',     value: date || '-',                 inline: true },
          { name: '\u200b',        value: '\u200b',                    inline: true },
          { name: '🤝 หารกับ',     value: splitLines },
        ],
        thumbnail: { url: BOT_AVATAR },
        footer: { text: 'SharePay • หารง่าย จ่ายชัวร์' },
        timestamp: new Date().toISOString(),
      }],
    });
  },

  /** แจ้งเตือน: มีการบันทึกชำระเงิน (settlement) */
  notifySettlement({ groupName = '', fromName, toName, amount }) {
    const money = (n) => `฿${Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return this.send({
      embeds: [{
        title: '✅ ยืนยันการชำระเงินแล้ว',
        description: `**${fromName}** จ่ายให้ **${toName}**เรียบร้อยแล้ว`,
        color: COLORS.settlement,
        fields: [
          { name: '💰 จำนวนเงิน', value: money(amount), inline: true },
          ...(groupName ? [{ name: '👥 กลุ่ม', value: groupName, inline: true }] : []),
        ],
        footer: { text: 'SharePay • หารง่าย จ่ายชัวร์' },
        timestamp: new Date().toISOString(),
      }],
    });
  },
};

window.Discord = Discord;
