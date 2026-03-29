
export function getRandomSubtitle(): string {

  const MESSAGES = [
    "感情の404、解析します。",
    "感情、見失ってませんか。",
    "その返事、バグですか感情ですか。",
    "この空気、Wi-Fiより不安定。",
    "なんか冷たい…の正体を探る。",
    "見えない感情を、見えるかたちに。",
    "不安の再帰処理、止めます。",
    "気まずさ、先行配信中！！！！！",
    "怖いのは文面か、こっちの妄想か。"
  ];
  
  return MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
}
