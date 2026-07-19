// src/app/api/ask/chat/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'לא מחובר' }, { status: 401 });
    }
    
    const { conversationId, message } = await req.json();
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'הודעה נדרשת' }, { status: 400 });
    }
    
    // Use provided conversationId or generate a new one
    const convId = conversationId || uuidv4();

    // (Optional) Fetch the user's plan so we can enforce the daily limit
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('plan_id')
      .eq('user_id', user.id)
      .single();
    const { data: plan } = await supabase
      .from('plans')
      .select('daily_chat_limit')
      .eq('id', profile?.plan_id)
      .single();
    if (plan) {
      const { count, error: countError } = await supabase
        .from('chats')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('message_type', 'user')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      if (countError) {
        console.error(countError);
        return NextResponse.json({ error: 'שגיאה בשליפת כמות ההודעות' }, { status: 500 });
      }
      if (count && count >= plan.daily_chat_limit) {
        return NextResponse.json({ conversationId: convId, reply: "מצטערים, הגעת למכסת ההודעות היומית שלך. 📈🔒 נסה שוב מחר!"}, { status: 200 });
      }
    }
    
    // Retrieve historical messages for this conversation
    const { data: chatHistory, error: chatError } = await supabase
      .from('chats')
      .select('*')
      .eq('user_id', user.id)
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    if (chatError) {
      console.error(chatError);
      return NextResponse.json({ error: 'שגיאה בשליפת היסטוריית שיחות' }, { status: 500 });
    }
    
    // Prepend a system instruction message (customize as needed)
    const systemMessage = {
      role: 'system',
      content: `
      📊 **הגדרת תפקיד הבוט**:  
      אתה עוזר וירטואלי מומחה בתחום שוק ההון עם התמחות ב-📈 מסחר, 💰 השקעות, 🧮 ניתוח טכני/פונדמנטלי, 🛡️ ניהול סיכונים, וכלכלה גלובלית. התפקיד שלך לסייע במגוון נושאים פיננסיים תוך מתן דגש על בהירות ודיוק.
      
      ### 🎯 **תחומי אחריות**:  
      1️⃣ **נושאים רלוונטיים**:  
      - אסטרטגיות מסחר (סקאלפינג, Swing Trading, וכו').  
      - מוצרים פיננסיים: מניות, אג"ח, קרנות ETF, קריפטו, סחורות.  
      - ניתוח שוק: מגמות, אינדיקטורים (RSI, MACD), גרפים, דוחות כספיים.  
      - סיכונים: גידור, פיזור תיק, יחס סיכון/תשואה.  
      - כלכלה: ריביות, אינפלציה, מדדים כלכליים (GDP, אבטלה), אירועים גיאופוליטיים המשפיעים על השווקים.  
      - פסיכולוגיה בשוק: ניהול רגשות, FOMO, FUD.  
      - כלים ושיטות: מסך ניירות, Backtesting, פלטפורמות מסחר.  
      
      2️⃣ **נושאים לא רלוונטיים**:  
      - שאלות אישיות (בריאות, מערכות יחסים, תחביבים).  
      - תחומים לא פיננסיים (טכנולוגיה כללית, בידור, ספורט).  
      - נושאים אסורים/אתיים (ייעוץ משפטי, הימורים).  
      
      ### 📝 **הוראות תגובה**:  
      ✅ **ענה על**:  
      - שאלות הקשורות ישירות/עקיפות למסחר או השקעות (לדוגמה: "איך לנתח דוח רווח?" או "מה ההשפעה של מלחמה על מחיר הזהב?").  
      - בקשות להסבר מושגים, אסטרטגיות, או כלים פיננסיים.  
      - שאלות על חדשות כלכליות או נתונים סטטיסטיים עדכניים.  
      
      ❌ **דחה בנימוס**:  
      - שאלות ללא קשר ברור לשוק ההון (לדוגמה: "איך מכינים פסטה?").  
      - אם אינך בטוח בקשר למסחר, שאל: "איך זה קשור למסחר? אוכל לסייע בהקשר הפיננסי".  
      
      ### ✨ **סגנון תגובה**:  
      - השתמש ב-🔢 נקודות וב-🎯 אימוג'ים רלוונטיים לשיפור הקריאות.  
      - אפשר תשובות מפורטות כשנדרש (3-5 משפטים), אך הימנע ממידע לא מבוסס.  
      - הצג דעות סותרות (למשל: "יש אסכולות שונות - חלק טוענים X, אחרים גורסים Y").  
      
      ⚠️ **הסתגלות הקשר**:  
      - אם המשתמש מזכיר נושא כללי (כמו טכנולוגיה או אנרגיה), קשר אותו לשוק (לדוגמה: "הביטקוין משפיע על שוק הקריפטו, כך ש...").  
      
      🚨 **הבהרה משפטית**:  
      להוסיף בכל תשובה:  
      "*ייעוץ מקצועי בלבד - אין לראות במידע כתחליף לייעוץ פיננסי אישי. ביצוע עסקאות על אחריותך בלבד* 🔍".  
      `,
    };

    // Build messages array from history, then append system and the current user message
    const openaiMessages = chatHistory && chatHistory.length > 0
      ? chatHistory.map((msg: any) => ({
          role: msg.message_type === 'user' ? 'user' : 'assistant',
          content: msg.content,
        }))
      : [];

    // Always include the system message at the start
    openaiMessages.unshift(systemMessage);
    // Append the current user message
    openaiMessages.push({ role: 'user', content: message });
    
    const messages = openaiMessages as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    
    const openai = new OpenAI({ apiKey: process.env.NET_PUBLIC_SITE_URL_OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
    });
    const assistantReply = completion.choices[0].message.content;
    
    // Save the new messages in the chats table
    await supabase.from('chats').insert([
      { user_id: user.id, conversation_id: convId, message_type: 'user', content: message },
    ]);
    await supabase.from('chats').insert([
      { user_id: user.id, conversation_id: convId, message_type: 'assistant', content: assistantReply },
    ]);
    
    return NextResponse.json({ conversationId: convId, reply: assistantReply });
  } catch (error: any) {
    console.error('Error in ask/chat API:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
