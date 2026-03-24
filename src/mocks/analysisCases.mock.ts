export async function analyze(caseId: string) {
  return {
    status: "analyzed",
    result: {
      textImpression: "文面は短いが、強い拒絶までは見られない",
      contextImpression: "忙しさが影響している可能性がある",
      scores: {
        angry: 0.2,
        busy: 0.75,
        justCold: 0.4,
        positive: 0.3,
        distance: 0.35
      },
      confidenceLevel: "medium",
      contactTiming: "少し時間を置いてから簡潔に連絡するのがよい",
      actions: [
        { text: "急ぎでなければ追撃を控える" },
        { text: "要点だけ簡潔に伝える" }
      ],
      avoidExpressions: [
        { text: "責める言い方" },
        { text: "強い催促" }
      ],
      goodSignals: [
        { text: "返信自体は返ってきている" },
        { text: "拒絶表現ではない" }
      ],
      replyExamples: [
        {
          text: "お忙しいところ恐れ入ります。ご都合の良いタイミングでご確認ください。",
          tone: "formal"
        },
        {
          text: "急ぎでなければ落ち着いたタイミングで大丈夫です！",
          tone: "casual"
        }
      ],
      reasons: [
        {
          label: "短文",
          detail: "短いが拒絶的な語調ではない"
        },
        {
          label: "状況",
          detail: "忙しい時期という情報と一致"
        }
      ]
    }
  }
}

export async function getResult(caseId: string) {
  return {
    status: "analyzed",
    result: {
      textImpression: "短文だがネガティブ断定はできない",
      contextImpression: "忙しさの影響が強い可能性",
      scores: {
        angry: 0.2,
        busy: 0.75,
        justCold: 0.4,
        positive: 0.3,
        distance: 0.35
      },
      confidenceLevel: "medium",
      contactTiming: "少し待つのが無難",
      actions: [{ text: "時間を置く" }],
      avoidExpressions: [{ text: "強い催促" }],
      goodSignals: [{ text: "返信はある" }],
      replyExamples: [
        { text: "お時間あるときで大丈夫です", tone: "neutral" }
      ],
      reasons: [
        { label: "短文", detail: "拒絶ではない" }
      ]
    }
  }
}

export async function getCasesByPerson(personId: string) {
  return {
    analysisCases: [
      {
        id: "case_mock_001",
        eventFacts: "資料を送ったら短文だけ返ってきた",
        status: "analyzed",
        createdAt: new Date().toISOString()
      },
      {
        id: "case_mock_002",
        eventFacts: "返信が来なくなった",
        status: "draft",
        createdAt: new Date().toISOString()
      }
    ],
    pagination: {
      hasMore: false
    }
  }
}