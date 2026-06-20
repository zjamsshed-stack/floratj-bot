import { Telegraf, Markup } from 'telegraf';
import mongoose from 'mongoose';

const CITIES = {
  'Душанбе': ['🏙️ Центральный', '🌳 Сино', '🏘️ Раджабов', '🌆 Сомони', '🏗️ Пролетарский', '✨ Фирдавси'],
  'Худжанд': ['🏘️ Центр', '🌳 Панджшанбе', '🏙️ Шахматчи', '🌆 Сино', '🏗️ Аврора'],
  'Куляб': ['🏙️ Центр', '🌳 Октябрь', '🏘️ Соцгород'],
  'Хорог': ['🏙️ Центр', '🌳 Панджшанбе'],
  'Турсунзаде': ['🏙️ Центр', '🌳 Юбилейный'],
  'Исфара': ['🏙️ Центр'],
  'Каратаг': ['🏙️ Центр'],
  'Рогун': ['🏙️ Центр'],
  'Нурек': ['🏙️ Центр']
};

const bouquetSchema = new mongoose.Schema({
  sellerId: String,
  sellerName: String,
  sellerPhone: String,
  photoId: String,
  price: Number,
  city: String,
  district: String,
  createdAt: { type: Date, default: Date.now },
  isActive: Boolean
});

let Bouquet = null;

async function connectDB() {
  if (Bouquet) return Bouquet;
  await mongoose.connect(process.env.MONGODB_URI);
  Bouquet = mongoose.model('Bouquet', bouquetSchema);
  return Bouquet;
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const userState = {};

bot.command('start', async (ctx) => {
  userState[ctx.from.id] = { step: 'menu' };
  await ctx.reply('🌹 FloraTJ\n\nЧто вы хотите?', Markup.keyboard([['💐 Продам букет'], ['🛍️ Купить букет'], ['📋 Мои букеты']]).oneTime().resize());
});

bot.hears('💐 Продам букет', async (ctx) => {
  userState[ctx.from.id] = { step: 'upload_photo' };
  await ctx.reply('📸 Загрузите фото');
});

bot.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  if (!userState[userId] || userState[userId].step !== 'upload_photo') return;
  userState[userId].photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  userState[userId].step = 'ask_price';
  await ctx.reply('💰 Цена?');
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;
  if (!userState[userId]) return;
  const s = userState[userId];

  try {
    if (s.step === 'ask_price') {
      s.price = parseInt(text);
      s.step = 'select_city';
      await ctx.reply('🗺️ Город?', Markup.keyboard(Object.keys(CITIES).map(c => [c])).resize().oneTime());
    } 
    else if (s.step === 'select_city') {
      if (!CITIES[text]) { await ctx.reply('Из списка'); return; }
      s.city = text;
      s.step = 'select_district';
      await ctx.reply('📍 Район?', Markup.keyboard(CITIES[text].map(d => [d])).resize().oneTime());
    } 
    else if (s.step === 'select_district') {
      if (!CITIES[s.city].includes(text)) { await ctx.reply('Из списка'); return; }
      s.district = text;
      s.step = 'ask_phone';
      await ctx.reply('📞 Номер?');
    } 
    else if (s.step === 'ask_phone') {
      s.phone = text;
      const B = await connectDB();
      const b = new B({
        sellerId: userId,
        sellerName: ctx.from.first_name,
        sellerPhone: s.phone,
        photoId: s.photoId,
        price: s.price,
        city: s.city,
        district: s.district,
        isActive: true
      });
      await b.save();
      delete userState[userId];
      await ctx.reply('✅ Букет добавлен!');
      await ctx.reply('Что дальше?', Markup.keyboard([['💐 Продам букет'], ['🛍️ Купить букет'], ['📋 Мои букеты']]).oneTime().resize());
    }
  } catch (error) {
    await ctx.reply('❌ Ошибка');
  }
});

bot.hears('🛍️ Купить букет', async (ctx) => {
  userState[ctx.from.id] = { step: 'select_buy_city' };
  const btn = Object.keys(CITIES).map(c => [c]);
  btn.push(['⬅️ Назад']);
  await ctx.reply('🗺️ Город?', Markup.keyboard(btn).resize().oneTime());
});

bot.hears(Object.keys(CITIES), async (ctx) => {
  const userId = ctx.from.id;
  const city = ctx.message.text;
  if (!userState[userId]) return;

  try {
    if (userState[userId].step === 'select_buy_city') {
      userState[userId].city = city;
      userState[userId].step = 'select_buy_district';
      const btn = CITIES[city].map(d => [d]);
      btn.push(['⬅️ Назад']);
      await ctx.reply('📍 Район?', Markup.keyboard(btn).resize().oneTime());
      return;
    }

    if (userState[userId].step === 'select_buy_district') {
      if (!CITIES[userState[userId].city].includes(city)) return;
      const B = await connectDB();
      const bouquets = await B.find({ city: userState[userId].city, district: city, isActive: true });
      if (bouquets.length === 0) { await ctx.reply('😔 Нет букетов'); return; }
      for (const b of bouquets) {
        await ctx.replyWithPhoto(b.photoId, { caption: b.city + '\n' + b.district + '\n' + b.price + '\n' + b.sellerPhone });
      }
      delete userState[userId];
    }
  } catch (error) {
    await ctx.reply('❌ Ошибка');
  }
});

bot.hears('📋 Мои букеты', async (ctx) => {
  try {
    const B = await connectDB();
    const b = await B.find({ sellerId: ctx.from.id.toString(), isActive: true });
    if (b.length === 0) { await ctx.reply('Нет букетов'); return; }
    for (const x of b) {
      await ctx.replyWithPhoto(x.photoId, { caption: x.district + '\n' + x.price + '\n' + x.sellerPhone });
    }
  } catch (error) {
    await ctx.reply('❌ Ошибка');
  }
});

bot.hears('⬅️ Назад', async (ctx) => {
  delete userState[ctx.from.id];
  await ctx.reply('Что дальше?', Markup.keyboard([['💐 Продам букет'], ['🛍️ Купить букет'], ['📋 Мои букеты']]).oneTime().resize());
});

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
      return res.status(200).json({ ok: true });
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(200).json({ ok: true });
  }
}
