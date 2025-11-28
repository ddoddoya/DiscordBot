const axios = require("axios");
const cron = require("node-cron");

// 모험섬 중 골드 보상이 있는 이벤트만 필터링
function getGoldAdventureIslands(calendar) {
  return calendar.filter(event => {
    if (event.CategoryName?.trim() !== "모험 섬") return false;

    return event.RewardItems?.some(reward =>
      reward.Items?.some(item => item.Name === "골드")
    );
  });
}

// 오늘 날짜 생성 (KST)
function getTodayStringLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// 오늘 날짜에 지급되는 골드 시간만 필터링
function getTodayGoldTimes(event) {
  const today = getTodayStringLocal();

  const goldItems = event.RewardItems
    ?.flatMap(r => r.Items)
    ?.filter(item => item.Name === "골드");

  if (!goldItems || goldItems.length === 0) return [];

  // StartTimes가 있는 골드만 today's times로 필터링
  return goldItems
    .flatMap(item => item.StartTimes || [])
    .filter(t => t.startsWith(today));
}

// 오늘 골드 지급 모험섬 목록
function getTodayGoldIslands(calendar) {
  const goldIslands = getGoldAdventureIslands(calendar);

  return goldIslands
    .map(island => {
      const todayTimes = getTodayGoldTimes(island);
      return todayTimes.length > 0 ? { ...island, todayTimes } : null;
    })
    .filter(Boolean);
}

// 스케줄러 실행
function startLostArkGoldNotifier(client) {
  cron.schedule(
    "2 20 * * *",
    async () => {
      try {
        const api = axios.create({
          baseURL: "https://developer-lostark.game.onstove.com",
          timeout: 10000,
          headers: {
            accept: "application/json",
            authorization: `Bearer ${process.env.LOSTARK_REST_KEY}`
          }
        });

        const res = await api.get("/gamecontents/calendar");
        const calendar = res.data;

        const todayGoldIslands = getTodayGoldIslands(calendar);
        if (todayGoldIslands.length === 0) return;

        const channel = client.channels.cache.get(process.env.CHANNEL_ID);
        if (!channel) return;

        let msg = `@everyone\n오늘은 🪙골드섬🪙이 있는 날입니다!\n`;

        todayGoldIslands.forEach(island => {
          msg += `섬이름: **${island.ContentsName}**\n`;
        });

        channel.send(msg);

      } catch (err) {
        console.error("[모험섬 알림 오류]", err.response?.data || err.message);
      }
    },
    { timezone: "Asia/Seoul" }
  );
}

module.exports = { startLostArkGoldNotifier };
