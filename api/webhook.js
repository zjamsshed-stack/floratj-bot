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
  description: String,
  createdAt: { type: Date, default: Date.now },
  isActive: Boolean
});

let Bouquet;

async function connectDB() {
  if (!Bouquet) {
    if (!mongoose.connection.readyState) {
      await mongoose.connect(process.env.MONGODB_URI);
    }
    Bouquet = mongoose.model('Bouquet', bouquetSchema);
  }
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const userState = {};

bot.command('start', async (ctx) => {
  const userId = ctx.from.id;
  userState[userId] = { step: 'menu' };
  await ctx.reply(
    '🌹 *Добро пожаловать в FloraTJ!*\n\n' +
    'Здесь девушки продают подаренные букеты, а покупатели находят свежие цветы рядом с домом.\n\n' +
    'Что вы хотите сделать?',
    Markup.keyboard([
      ['💐 Продам букет'],
      ['🛍️ Купить букет'],
      ['📋 Мои букеты']
    ])
      .oneTime()
      .resize()
  );
});

bot.hears('💐 Продам букет', async (ctx) => {
  const userId = ctx.from.id;
  userState[userId] = { step: 'upload_photo' };
  await ctx.reply('📸 Отлично! Загрузите фото букета.\n\n_Это должно быть хорошее фото с хорошим освещением_');
});

bot.on('photo', async (ctx) => {
  try {
    await connectDB();
    const userId = ctx.from.id;
    if (!userState[userId]) {
      await ctx.reply('Пожалуйста, нажмите "Продам букет" чтобы начать');
      return;
    }
    const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    if (userState[userId].step === 'upload_photo') {
      userState[userId].photoId = photoId;
      userState[userId].step = 'ask_price';
      await ctx.reply('💰 Сколько вы хотите получить за букет?\n\n_Ответьте просто цифрой, например: 150_');
    }
  } catch (error) {
    console.error('Ошибка:', error);
    await ctx.reply('❌ Ошибка. Попробуйте снова.');
  }
});

bot.on('text', async (ctx) => {
  try {
    await connectDB();
    const userId = ctx.from.id;
    const text = ctx.message.text;
    if (!userState[userId]) return;
    const state = userState[userId];

    if (state.step === 'ask_price') {
      const price = parseInt(text);
      if (isNaN(price) || price < 10) {
        await ctx.reply('❌ Введите корректную цену (минимум 10 сомони)');
        return;
      }
      state.price = price;
      state.step = 'select_city';
      const cityButtons = Object.keys(CITIES).map(city => [city]);
      await ctx.reply('🗺️ В каком городе вы находитесь?', Markup.keyboard(cityButtons).resize().oneTime());
    } else if (state.step === 'select_city') {
      if (!CITIES[text]) {
        await ctx.reply('❌ Выберите город из списка');
        return;
      }
      state.city = text;
      state.step = 'select_district';
      const districtButtons = CITIES[text].map(district => [district]);
      await ctx.reply('📍 Выберите ваш район в городе:', Markup.keyboard(districtButtons).resize().oneTime());
    } else if (state.step === 'select_district') {
      const cityDistricts = CITIES[state.city];
      if (!cityDistricts.includes(text)) {
        await ctx.reply('❌ Выберите район из списка');
        return;
      }
      state.district = text;
      state.step = 'ask_phone';
      await ctx.reply('📞 Укажите ваш номер телефона для связи:\n\n_Например: +992 90 123 45 67_');
    } else if (state.step === 'ask_phone') {
      if (!text.match(/[\d\s\+\-\(\)]{5,}/)) {
        await ctx.reply('❌ Укажите корректный номер телефона');
        return;
      }
      state.phone = text;
      const newBouquet = new Bouquet({
        sellerId: userId,
        sellerName: ctx.from.first_name,
        sellerPhone: state.phone,
        photoId: state.photoId,
        price: state.price,
        city: state.city,
        district: state.district,
        description: '',
        isActive: true
      });
      await newBouquet.save();
      delete userState[userId];
      await ctx.reply('✅ *Отлично! Ваш букет выставлен!*\n\n🗺️ ' + state.city + '\n📍 ' + state.district + '\n💰 ' + state.price + ' сомони\n📞 ' + state.phone + '\n\nПокупатели найдут вас в каталоге. Удачи! 🍀');
      await ctx.reply('Что дальше?', Markup.keyboard([['💐 Продам букет'], ['🛍️ Купить букет'], ['📋 Мои букеты']]).oneTime().resize());
    }
  } catch (error) {
    console.error('Ошибка:', error);
    await ctx.reply('❌ Ошибка. Попробуйте снова.');
  }
});

bot.hears('🛍️ Купить букет', async (ctx) => {
  const userId = ctx.from.id;
  userState[userId] = { step: 'select_buy_city' };
  const cityButtons = Object.keys(CITIES).map(city => [city]);
  cityButtons.push(['⬅️ Назад']);
  await ctx.reply('🗺️ Выберите город, где вы ищете букет:', Markup.keyboard(cityButtons).resize().oneTime());
});

bot.hears(Object.keys(CITIES), async (ctx) => {
  try {
    await connectDB();
    const userId = ctx.from.id;
    const city = ctx.message.text;
    if (!userState[userId]) return;

    if (userState[userId].step === 'select_buy_city') {
      userState[userId].city = city;
      userState[userId].step = 'select_buy_district';
      const districtButtons = CITIES[city].map(district => [district]);
      districtButtons.push(['⬅️ Назад']);
      await ctx.reply('📍 Выберите район:', Markup.keyboard(districtButtons).resize().oneTime());
      return;
    }

    if (userState[userId].step === 'select_buy_district') {
      const cityDistricts = CITIES[userState[userId].city];
      if (!cityDistricts.includes(city)) return;

      const district = city;
      const selectedCity = userState[userId].city;
      const bouquets = await Bouquet.find({ city: selectedCity, district: district, isActive: true }).sort({ createdAt: -1 });

      if (bouquets.length === 0) {
        await ctx.reply('😔 К сожалению, в районе "' + district + '" города "' + selectedCity + '" пока нет букетов.\n\nПопробуйте другой район.');
        return;
      }

      for (const bouquet of bouquets) {
        const button = Markup.inlineKeyboard([[Markup.button.callback('❌ Удалить', 'delete_' + bouquet._id)]]);
        await ctx.replyWithPhoto(bouquet.photoId, {
          caption: '🗺️ ' + bouquet.city + '\n📍 ' + bouquet.district + '\n💰 ' + bouquet.price + ' сомони\n📞 ' + bouquet.sellerPhone,
          parse_mode: 'HTML',
          ...button
        });
      }

      await ctx.reply('Что дальше?', Markup.keyboard([['💐 Продам букет'], ['🛍️ Купить букет'], ['📋 Мои букеты']]).oneTime().resize());
      delete userState[userId];
    }
  } catch (error) {
    console.error('Ошибка:', error);
    await ctx.reply('❌ Ошибка. Попробуйте снова.');
  }
});

bot.hears('📋 Мои букеты', async (ctx) => {
  try {
    await connectDB();
    const userId = ctx.from.id;
    const myBouquets = await Bouquet.find({ sellerId: userId.toString(), isActive: true });

    if (myBouquets.length === 0) {
      await ctx.reply('У вас пока нет активных букетов.');
      return;
    }

    await ctx.reply('📊 У вас ' + myBouquets.length + ' букет(ов) на продаже:\n');
    for (const bouquet of myBouquets) {
      const button = Markup.inlineKeyboard([[Markup.button.callback('❌ Удалить', 'delete_' + bouquet._id)]]);
      await ctx.replyWithPhoto(bouquet.photoId, {
        caption: '💐 ' + bouquet.district + '\n💰 ' + bouquet.price + ' сомони\n📞 ' + bouquet.sellerPhone,
        ...button
      });
    }
  } catch (error) {
    console.error('Ошибка:', error);
    await ctx.reply('❌ Ошибка. Попробуйте снова.');
  }
});

bot.action(/delete_(.+)/, async (ctx) => {
  try {
    await connectDB();
    const bouquetId = ctx.match[1];
    const userId = ctx.from.id;
    const bouquet = await Bouquet.findById(bouquetId);
    if (!bouquet || bouquet.sellerId !== userId.toString()) {
      await ctx.reply('❌ Вы не можете удалить этот букет.');
      return;
    }
    await Bouquet.findByIdAndUpdate(bouquetId, { isActive: false });
    await ctx.answerCbQuery('✅ Букет удален');
    await ctx.reply('✅ Букет удален из каталога.');
  } catch (error) {
    console.error('Ошибка:', error);
    await ctx.answerCbQuery('❌ Ошибка');
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
      return res.status(200).json({ ok: true });
    }
    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Handler error:', error);
    return res.status(200).json({ ok: true });
  }
}
