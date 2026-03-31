const axios = require('axios');
const { EmbedBuilder } = require('discord.js');
const pool = require('../database');
require('dotenv').config();


// 식별용 고유 키 생성 함수 (중복 알림 방지)
function generateItemKey(item) {
    const upgrades = (item.Options || []).map(opt => `${opt.OptionName}${opt.Value}`).join('');
    return `${item.Name}_${item.AuctionInfo.BuyPrice}_${item.AuctionInfo.TradeAllowCount}_${upgrades}`;
}

// 스나이핑 스케줄러 핵심 함수
function startAuctionSniper(client) {
    const apiBase = process.env.LOSTARK_API_BASE || 'https://developer-lostark.game.onstove.com';
    const token = process.env.LOSTARK_REST_KEY;

    // 1분(60,000ms)마다 반복 실행
    setInterval(async () => {
        try {
            const [alerts] = await pool.query('SELECT * FROM auction_alerts');
            if (alerts.length === 0) return; 

            for (const alert of alerts) {
                const requestBody = typeof alert.search_body === 'string' ? JSON.parse(alert.search_body) : alert.search_body;
                let notifiedKeys = typeof alert.notified_keys === 'string' ? JSON.parse(alert.notified_keys) : alert.notified_keys;
                let isUpdated = false;

                const minTradeCount = requestBody.Bot_MinTradeCount;

                try {
                    const { data } = await axios.post(
                        `${apiBase}/auctions/items`,
                        requestBody,
                        { headers: { accept: 'application/json', authorization: `Bearer ${token}` } }
                    );

                    const items = data.Items || [];
                    
                    const matchedItems = items.filter(item => {
                        const isPriceMatch = item.AuctionInfo?.BuyPrice && item.AuctionInfo.BuyPrice <= alert.target_price;
                        const isTradeMatch = minTradeCount === null || item.AuctionInfo.TradeAllowCount >= minTradeCount;
                        return isPriceMatch && isTradeMatch;
                    });

                    for (const item of matchedItems) {
                        const itemKey = generateItemKey(item);

                        if (!notifiedKeys.includes(itemKey)) {
                            notifiedKeys.push(itemKey);
                            isUpdated = true;

                            const channel = await client.channels.fetch(process.env.CHANNEL_ID2);
                            
                            const upgrades = (item.Options || [])
                                .filter(opt => opt.Type === 'ACCESSORY_UPGRADE')
                                .map(opt => `${opt.OptionName} ${opt.Value}${opt.IsValuePercentage ? '%' : ''}`)
                                .join('\n\t ') || '-';
                                
                            const power = (item.Options || []).find(opt => ['힘', '민첩', '지능'].includes(opt.OptionName));
                            const powerValue = power ? `${power.OptionName} ${power.Value}` : '-';
                            
                            const embed = new EmbedBuilder()
                                .setTitle('🚨경매장에 매물등장!')
                                .setColor('Red')
                                .setDescription(`**아이템:** ${item.Name}`)
                                .addFields(
                                    { name: '💰 즉시구매가', value: `${item.AuctionInfo.BuyPrice.toLocaleString()} 🪙\n(등록 목표가: ${alert.target_price.toLocaleString()})`, inline: false },
                                    { name: '✨ 연마효과', value: upgrades, inline: false },
                                    { name: '💎 힘민지', value: powerValue, inline: true },
                                    { name: '🔄 거래가능횟수', value: `${item.AuctionInfo.TradeAllowCount}회`, inline: true }
                                )
                                .setTimestamp();

                            await channel.send({ 
                                content: `<@${alert.user_id}> 님! 지정하신 악세서리가 올라왔습니다!`, 
                                embeds: [embed] 
                            });
                        }
                    }

                    if (isUpdated) {
                        if (notifiedKeys.length > 50) notifiedKeys = notifiedKeys.slice(-50);
                        await pool.query(
                            'UPDATE auction_alerts SET notified_keys = ? WHERE id = ?',
                            [JSON.stringify(notifiedKeys), alert.id]
                        );
                    }

                } catch (error) {
                    if (error.response && error.response.status === 503) {
                        // 점검 중일 때는 콘솔에 에러를 띄우지 않고 조용히 패스합니다.
                    } else {
                        console.error(`[알림 ID ${alert.id}] API 스나이핑 오류:`, error.message);
                    }
                }

                // API Rate Limit 방어를 위해 유저당 1초 간격 두기
                await new Promise(resolve => setTimeout(resolve, 1000)); 
            }
        } catch (dbError) {
            console.error('DB 알림 목록 조회 중 오류:', dbError);
        }
    }, 60000); 
}

// 외부에서 이 함수를 가져다 쓸 수 있도록 export
module.exports = { startAuctionSniper };
