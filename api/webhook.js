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
let mongooseConnection = null;

async function connectDB() {
  if (mongooseConnection && mongooseConnection.readyState === 1) {
    if (!Bouquet) {
      Bouquet = mongooseConnection.model('Bouquet', bouquetSchema);
    }
    return Bouquet;
  }
  
  mongooseConnection = await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 10000,
  });
  
  Bouquet = mongooseConnection.model('Bouquet', bouquetSchema);
  return Bouquet;
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const userState = {};

bot.command('start', async (ctx) => {
  userState[ctx.from.id] = { step: 'menu' };
  await ctx.reply('🌹 Добро пожаловать в FloraTJ!\n\nЧто вы хотите сделать?', 
    Markup.keyboard([['💐 Продам букет'], ['🛍️ Купить букет'], ['📋 Мои букеты']]).oneTime().resize());
});

bot.hears('💐 Продам букет', async (ctx) => {
  userState[ctx.from.id] = { step: 'upload_photo' };
  await ctx.reply('📸 Загрузите фото букета');
});

bot.on('photo', async (ctx) => {
  try {
    const userId = ctx.from.id;
    if (!userState[userId] || userState[userId].step !== 'upload_photo') {
      await ctx.reply('Нажмите "Продам букет"');
      return;
    }
    const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    userState[userId].photoId = photoId;
    userState[userId].step = 'ask_price';
    await ctx.reply('💰 Цена букета? (число)');
  } catch (error) {
    await ctx.reply('❌ Ошибка');
  }
});

bot.on('text', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    if (!userState[userId]) return;
    const state = userState[userId];

    if (state.step === 'ask_price') {
      const price = parseInt(text);
      if (isNaN(price) || price < 10) {
        await ctx.reply('❌ Введите число (минимум 10)');
        return;
      }
      state.price = price;
      state.step = 'select_city';
      const buttons = Object.keys(CITIES).map(c => [c]);
      await ctx.reply('🗺️ Город?', Markup.keyboard(buttons).resize().oneTime());
    } 
    else if (state.step === 'select_city') {
      if (!CITIES[text]) {
        await ctx.reply('❌ Выберите из списка');
        return;
      }
      state.city = text;
      state.step = 'select_district';
      const buttons = CITIES[text].map(d => [d]);
      await ctx.reply('📍 Район?', Markup.keyboard(buttons).resize().oneTime());
    } 
    else if (state.step === 'select_district') {
      if (!CITIES[state.city].includes(text)) {
        await ctx.reply('❌ Выберите из списка');
        return;
      }
      state.district = text;
      state.step = 'ask_phone';
      await ctx.reply('📞 Ваш номер?');
    } 
    else if (state.step === 'ask_phone') {
      state.phone = text;
      const BouquetModel = await connectDB();
      const newBouquet = new BouquetModel({
        sellerId: userId,
        sellerName: ctx.from.first_name,
        sellerPhone: state.phone,
        photoId: state.photoId,
        price: state.price,
        city: state.city,
        district: state.district,
        isActive: true
      });
      await newBouquet.save();
      delete userState[userId];
      
      await ctx.reply('✅ Букет выставлен!\n🗺️ ' + state.city + '\n📍 ' + state.district + '\n💰 ' + state.price);
      await ctx.reply('Что дальше?', Markup.keyboard([['💐 Продам букет'], ['🛍️ Купить букет'], ['📋 Мои букеты']]).oneTime().resize());
    }
  } catch (error) {
    console.error('Ошибка:', error);
    await ctx.reply('❌ Ошибка. Попробуйте снова');
  }
});

bot.hears('🛍️ Купить букет', async (ctx) => {
  userState[ctx.from.id] = { step: 'select_buy_city' };
  const buttons = Object.keys(CITIES).map(c => [c]);
  buttons.push(['⬅️ Назад']);
  await ctx.reply('🗺️ Город?', Markup.keyboard(buttons).resize().oneTime());
});

bot.hears(Object.keys(CITIES), async (ctx) => {
  try {
    const userId = ctx.from.id;
    const city = ctx.message.text;
    if (!userState[userId]) return;

    if (userState[userId].step === 'select_buy_city') {
      userState[userId].city = city;
      userState[userId].step = 'select_buy_district';
      const buttons = CITIES[city].map(d => [d]);
      buttons.push(['⬅️ Назад']);
      await ctx.reply('📍 Район?', Markup.keyboard(buttons).resize().oneTime());
      return;
    }

    if (userState[userId].step === 'select_buy_district') {
      if (!CITIES[userState[userId].city].includes(city)) return;
      const BouquetModel = await connectDB();
      const bouquets = await BouquetModel.find({
        city: userState[userId].city,
        district: city,
        isActive: true
      }).lean();

      if (bouquets.length === 0) {
        await ctx.reply('😔 Нет букетов');
        return;
      }

      for (const b of bouquets) {
        await ctx.replyWithPhoto(b.photoId, {
          caption: '🗺️ ' + b.city + '\n📍 ' + b.district + '\n💰 ' + b.price + '\n📞 ' + b.sellerPhone
        });
      }
      delete userState[userId];
    }
  } catch (error) {
    console.error('Ошибка:', error);
    await ctx.reply('❌ Ошибка');
  }
});

bot.hears('📋 Мои букеты', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const BouquetModel = await connectDB();
    const bouquets = await BouquetModel.find({sellerId: userId.toString(), isActive: true}).lean();
    if (bouquets.length === 0) {
      await ctx.reply('У вас нет букетов');
      return;
    }
    for (const b of bouquets) {
      await ctx.replyWithPhoto(b.photoId, {caption: '💐 ' + b.district + '\n💰 ' + b.price + '\n📞 ' + b.sellerPhone});
    }
  } catch (error) {
    await ctx.reply('❌ Ошибка');
  }
});

bot.hears('⬅️ Назад', async (ctx) => {
  delete userState[ctx.from.id];
  await ctx.reply('Что вы хотите сделать?', Markup.keyboard([['💐 Продам букет'], ['🛍️ Купить букет'], ['📋 Мои букеты']]).oneTime().resize());
});

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
      return res.status(200).json({ok: true});
    }
    return res.status(200).json({status: 'ok'});
  } catch (error) {
    return res.status(200).json({ok: true});
  }
}
