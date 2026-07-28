import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: Request) {
  const openai = new OpenAI({
    apiKey: process.env.NET_PUBLIC_SITE_URL_OPENAI_API_KEY,
  });
  try {
    const { previousAnswers, questionNumber, reason } = await req.json();

    const prompt = `You are helping to understand why a user wants to cancel their subscription. 
    Their initial reason was: "${reason}".
    Previous answers: ${JSON.stringify(previousAnswers)}.
    Based on this context, generate the next question (question number ${questionNumber + 1}) 
    that would help understand their situation better and potentially find a solution.
    The response should be in Hebrew and should be empathetic and understanding.
    Only return the question text, nothing else.`;

    const completion = await openai.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "gpt-4o-mini",
    });

    const question = completion.choices[0].message.content;

    return NextResponse.json({ question });
  } catch (error) {
    console.error('Error generating question:', error);
    return NextResponse.json(
      { error: 'Failed to generate question' },
      { status: 500 }
    );
  }
} 