import { GoogleGenAI } from "@google/genai";
import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

app.use(cors());
app.use(express.json());

app.post("/api/ocr", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "이미지가 없습니다." });
    }

    if (!process.env.CLOVA_OCR_URL || !process.env.CLOVA_OCR_SECRET) {
      return res.status(500).json({
        message: "CLOVA OCR 환경변수가 설정되지 않았습니다.",
      });
    }

    const base64Image = req.file.buffer.toString("base64");
    const fileFormat = req.file.mimetype.includes("png") ? "png" : "jpg";

    const response = await fetch(process.env.CLOVA_OCR_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OCR-SECRET": process.env.CLOVA_OCR_SECRET,
      },
      body: JSON.stringify({
        version: "V2",
        requestId: String(Date.now()),
        timestamp: Date.now(),
        images: [
          {
            format: fileFormat,
            name: "receipt",
            data: base64Image,
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error) {
    console.error("OCR error:", error);
    res.status(500).json({ message: "OCR 분석 중 오류가 발생했습니다." });
  }
});

app.post("/api/coach", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        message: "GEMINI_API_KEY가 설정되지 않았습니다.",
      });
    }

    const {
      nickname,
      income,
      budget,
      savingGoal,
      totalExpense,
      expectedSaving,
      savingRate,
      budgetUsageRate,
      topCategory,
      topCategoryRate,
      categoryTotals,
      recommendedCards,
    } = req.body;

    const userName = nickname && nickname.trim() !== "" ? nickname.trim() : "사용자";

    const prompt = `
    너는 친절한 금융 코치다.

    반드시 지켜야 할 규칙:
    - 답변의 첫 문장은 반드시 "${userName}님,"으로 시작해야 한다.
    - "[사용자 이름]"이라는 표현은 절대 쓰지 마라.
    - "사회초년생님"이라는 표현도 절대 쓰지 마라.
    - 마크다운 굵게 표시(** **)는 쓰지 마라.
    - 사용자를 부를 때는 항상 "${userName}님"이라고 불러라.

    반드시 지킬 것:
    - 사용자를 부를 때는 오직 "${userName}님"이라고만 불러라/
    - 첫 문장은 반드시 "${userName}님,"으로 시작해야 한다.

    [사용자 소비 데이터]
    사용자 닉네임: ${userName}
    월 수입: ${income}원
    월 예산: ${budget}원
    저축 목표: ${savingGoal}원
    총 소비액: ${totalExpense}원
    예상 저축 가능 금액: ${expectedSaving}원
    절약률: ${savingRate}%
    예산 사용률: ${budgetUsageRate}%
    최대 소비 카테고리: ${topCategory || "없음"} (${topCategoryRate || 0}%)

    카테고리별 소비:
    ${JSON.stringify(categoryTotals, null, 2)}

    추천 카드 후보:
    ${JSON.stringify(recommendedCards, null, 2)}

    아래 형식으로 한국어로 간결하게 작성해줘.

    📊 소비 분석
    - 현재 소비 상태를 2문장으로 요약

    💰 저축 목표 평가
    - 저축 목표 달성 가능성을 1~2문장으로 평가

    ✅ 절약 팁
    1. 바로 실천 가능한 절약 팁
    2. 바로 실천 가능한 절약 팁

    💳 카드 혜택 참고
    - 추천 카드 후보를 참고하되, 실제 가입 권유가 아니라 소비패턴에 맞는 혜택 유형 안내로 작성
    `;

    const result = await gemini.models.generateContent({
      model: "gemini-1.5-flash",
      contents: prompt,
    });

    let coachText = result.text || "AI 코칭 결과를 생성하지 못했습니다.";

    coachText = coachText
      .replaceAll("사회초년생님", `${userName}님`)
      .replaceAll("사회초년생 님", `${userName}님`)
      .replaceAll("[사용자 이름]님", `${userName}님`)
      .replaceAll("사용자님", `${userName}님`);

    if (!coachText.startsWith(`${userName}님`)) {
      coachText = `${userName}님, ${coachText}`;
    }

    res.json({
      message: coachText,
    });
  } catch (error) {
    console.error("Gemini error:", error);

    res.status(500).json({
      message: "Gemini 생성 실패",
      error: error.message,
  });
  }
});

app.listen(4000, () => {
  console.log("Server running on http://localhost:4000");
  console.log("OCR + Gemini coach API ready");
  console.log("Gemini key:", process.env.GEMINI_API_KEY ? "있음" : "없음");
});