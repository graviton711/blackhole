import { GoogleGenAI } from "@google/genai";
import { BlackHoleParams } from "../types";

export const analyzeBlackHole = async (params: BlackHoleParams): Promise<string> => {
  if (!process.env.API_KEY) {
    throw new Error("Missing API Key");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Construct a prompt based on the physics parameters
  // We specifically request the response in Vietnamese as per the user's query language context
  const prompt = `
    Đóng vai một nhà vật lý thiên văn chuyên nghiệp. Hãy phân tích một hố đen giả lập với các thông số sau:
    - Khối lượng: ${params.mass} lần khối lượng Mặt Trời.
    - Độ xoáy (Spin): ${params.spin.toFixed(2)} (0 là tĩnh, 1 là cực đại).
    - Nhiệt độ đĩa bồi tụ: ${params.temperature} Kelvin.
    - Mật độ vật chất: ${params.accretionDensity.toFixed(2)}.

    Hãy cung cấp một đoạn văn ngắn (khoảng 100 từ) mô tả:
    1. Kích thước ước tính của Chân trời sự kiện (Event Horizon).
    2. Hiệu ứng giãn nở thời gian tại khu vực đĩa bồi tụ.
    3. Màu sắc và dạng bức xạ chính mà hố đen này phát ra.
    
    Văn phong khoa học, hấp dẫn, dễ hiểu.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    return response.text || "Không thể phân tích dữ liệu.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Lỗi kết nối với AI.");
  }
};
