// Bounded checks for known unsafe expressions and credential-sharing instructions.
// It is not a semantic classifier or a proof of prompt-injection resistance.
export const CONTENT_BLOCK_MESSAGE = 'この結果は安全に表示できることを確認できないため、表示を停止しました。保存した相談はそのまま残っています。';
const SECRET = /パスワード|暗証番号|認証コード|ワンタイム(?:コード|パスワード)|再設定リンク|復旧コード|秘密鍵|認証情報|アクセストークン|リフレッシュトークン|\b(?:passwords?|passcodes?|credentials?|private keys?|(?:verification|authentication|recovery|one[- ]time|sign[- ]in|six[- ]digit)(?: sign[- ]in)? codes?)\b/iu;
const ACTION = /教え(?:て|る|ましょう|(?=な))|送(?:って|信|付|る|り|ら)|渡(?:して|す|し|さ)|共有(?:して|する|し)|貼(?:って|る|り)|伝え(?:て|る|ましょう|(?=な))|開示(?:して|する)|提供(?:して|する)|入力(?:して|する|し)|\b(?:send|shar(?:e|ing)|give|tell|forward|disclose|paste|enter|input|provide)\b/giu;
const ENTRY = /^(?:入力|enter|input)/iu;
const SITE = /https?:\/\/|www\.|サイト|リンク|ページ|フォーム|\b(?:site|link|page|form)\b/iu;

function negated(text: string, offset: number, end: number): boolean {
  const before = text.slice(0, offset);
  const after = text.slice(end);
  // A negation inside an obligation is not a refusal to perform the action.
  if (/^(?:(?:する|して|し|こと|の|て)?(?:は|を|も)?)*(?:なくては|なければ|ないと|ないわけには|ないことは(?:ない|ありません)|ないとは言え)/u.test(after)) return false;
  if (/^(?:する|して|し)?ない(?:場合|なら).{0,30}(?:できません|不可能|失敗|進めません|必要)/u.test(after)) return false;
  return /(?:\b(?:do not|don't|never|avoid|cannot|can't|will not|won't|(?:should|must|can|would|could)\s+not|not to)\s*(?:(?:ever|ever again|under any circumstances)\s*)?)$/iu.test(before)
    || /^(?:(?:する|して|し|こと|の|て)?(?:は|を|も)?)*(?:ない|なく|ません|ありません|できません|いけません|必要(?:は|が)?(?:ありません|ない)|避け|控え|やめ|不要|禁止|拒否|断る|危険|安全では)/u.test(after)
    || /^(?:する|して|し)?と(?:危険です|危険があります|安全ではありません)$/u.test(after)
    || /^(?:と(?:は)?(?:言えません|言わない|返信しない|送信しない)|と言われた|と聞かれた|と頼まれた|という(?:要求|文面|相談))/u.test(after)
    || /^よう(?:に)?(?:求められ|頼まれ|言われ)た(?:状況|こと|旨|事実)(?:が記載されています|です|があります)$/u.test(after)
    || /^(?:ほしい|欲しい|ください)と(?:言われ|求められ|頼まれ)(?:ました|ています|た)$/u.test(after);
}

export function maskReportedContent(original: string): string {
  const text = original.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/gu, '');
  return text.replace(/「[^「」]*」|『[^『』]*』|“[^“”]*”|"[^"\n]*"/gu, (quote: string, offset: number) => {
    const before = text.slice(0, offset);
    const after = text.slice(offset + quote.length);
    const reported = /^(?:と(?:聞かれ|言われ|頼まれ|求められ|書かれ|記載され)|という(?:要求|文面|相談|言葉|発言|メッセージ)|とは(?:言えません|言わない)|と(?:返信|送信)しない)/u.test(after)
      || /\b(?:said|asked|wrote|told me)\s*[:：]?\s*$/iu.test(before);
    // Quoting a command and asking the reader to send it is still a command.
    const relay = /同じことをしてください|実行する|(?:その(?:通り|とおり)|上記|この文|その文).{0,20}(?:返信|送って|送信|送付|伝えて)|(?:そのように|そう|同様に).{0,12}(?:対応してください|行動してください|実行してください)|(?:要求|指示|命令|依頼).{0,12}(?:従って|従い|従う|応じて|応じる)|\b(?:send|reply with|follow|obey|comply with)\s+(?:this|that|the above|the (?:request|instruction|command))\b/iu.test(after);
    return reported && !relay ? '引用内容' : quote;
  });
}

function riskyInstruction(original: string, avoided: boolean): boolean {
  const text = maskReportedContent(original);
  const containsSecret = SECRET.test(text);
  for (const clause of text.split(/[。.!?！？\n]|ただし|しかし|\bhowever\b/iu)) {
    const hasSecret = SECRET.test(clause);
    // The referred credential may be introduced in the following sentence too.
    const refersBack = containsSecret && /それ|上記|その情報|相手に|他人に|担当者に|こちらに|\b(?:it|them|those|that|the above)\b/iu.test(clause);
    if (hasSecret || refersBack) {
      for (const match of clause.matchAll(ACTION)) {
        const offset = match.index!;
        if (negated(clause, offset, offset + match[0].length)) continue;
        // Relaying a refusal does not ask the user to relay the credential.
        if (/^伝え/u.test(match[0]) && /(?:共有|送信|送付|提供|開示|入力|教え|渡せ)(?:する|し|でき|られ)?(?:ない|ません)(?:旨|こと)?(?:と|よう)(?:相手|担当者|他人)?に?\s*$/u.test(clause.slice(0, offset))) continue;
        if (/\b(?:was|were) asked to\s*$/iu.test(clause.slice(0, offset))) continue;
        if (ENTRY.test(match[0]) && !SITE.test(text)) continue;
        // Names of avoided actions are descriptive; an explicit positive request isn't.
        if (avoided && !/ください|ましょう|べき|おすすめ|お勧め|必要があります|必要です|\b(?:please|should|must|need to|required|recommend)\b/iu.test(clause)) continue;
        return true;
      }
    }
  }
  return false;
}

function isAvoidedActionName(path: string[]): boolean {
  return (path[0] === 'avoidActions' && path[2] === 'label')
    || (path[0] === 'avoidExpressions' && path[2] === 'text');
}

export function hasUnsafeModelContent(value: unknown): boolean {
  const pending: Array<{ value: unknown; path: string[]; depth: number }> = [{ value, path: [], depth: 0 }];
  const seen = new Set<object>();
  let visited = 0;
  while (pending.length) {
    const item = pending.pop()!;
    if (++visited > 10_000 || item.depth > 32) return true;
    if (typeof item.value === 'string') {
      if (hasKnownUnsafeText(item.value, item.path) || riskyInstruction(item.value, isAvoidedActionName(item.path))) return true;
    } else if (item.value && typeof item.value === 'object') {
      if (seen.has(item.value)) return true;
      seen.add(item.value);
      for (const [key, child] of Object.entries(item.value)) pending.push({ value: child, path: [...item.path, key], depth: item.depth + 1 });
    }
  }
  return false;
}

const UNSAFE_ASSERTION_PATTERNS = [
    /絶対に.{0,12}(怒|嫌)/u,
    /間違いなく.{0,12}(嫌|怒)/u,
    /あなたは認知が歪んで/u,
    /診断結果/u,
    /嫌われ度/u,
    /脈なし度/u,
    /危険度/u,
    /(うつ病|人格障害|サイコパス).{0,12}(です|だ|確定)/u,
    /\b(?:the person|your partner|he|she|they|you)\s+(?:definitely\s+)?(?:has|have|is|are)\s+(?:definitely\s+)?(?:a\s+)?(?:personality disorder|psychopath|depression)\b/iu,
] as const;

// These field/phrase checks cover known regressions, not a complete multilingual safety policy.
const AGGRESSIVE_ACTION_PATTERN = /(殴打(?:する|して|し)?|殴(?:る|って|り|れ)|蹴(?:る|って|り|れ)|脅(?:す|して|し|せ)|晒(?:す|して|し|せ)|仕返し|復讐|追い詰め(?:る|て|ろ))/gu;
// Person-targeted phrases avoid treating unrelated uses such as a hit song as aggression.
const ENGLISH_AGGRESSIVE_ACTION_PATTERN = /\b(?:hit(?:ting)?|punch(?:ing)?|threaten(?:ing)?)\s+(?:(?:the|your|other)\s+)*(?:other person|person|partner|them|him|her|you)\b/iu;
const DIRECT_INSTRUCTION_PATTERN = /(ましょう|してください|しよう|べき|おすすめ|お勧め|しなさい|してよい|してもよい|必要があります)/u;

export function hasKnownUnsafeText(text: string, path: string[]): boolean {
        const safetyText = maskReportedContent(text);
        const assertionText = maskDiscussedQuotes(safetyText);
        if (UNSAFE_ASSERTION_PATTERNS.some(pattern => pattern.test(assertionText))) {
            return true;
        }

        const avoidedLabel = isAvoidedActionName(path);
        if (ENGLISH_AGGRESSIVE_ACTION_PATTERN.test(safetyText)) {
            // Only a whole-field denial or an avoided gerund label is exempt. A second
            // sentence/inverted negation cannot conceal an instruction behind a warning.
            const standaloneAvoidance = /^(?:do not|don't|never)\s+(?:hit|punch|threaten)\s+(?:(?:the|your|other)\s+)*(?:other person|person|partner|them|him|her|you)[.!?]?\s*$/iu.test(text)
                || /^avoid\s+(?:hitting|punching|threatening)\s+(?:(?:the|your|other)\s+)*(?:other person|person|partner|them|him|her|you)[.!?]?\s*$/iu.test(text);
            const avoidedName = avoidedLabel && /^(?:hitting|punching|threatening)\s+(?:(?:the|your|other)\s+)*(?:other person|person|partner|them|him|her|you)[.!?]?\s*$/iu.test(text);
            if (!standaloneAvoidance && !avoidedName) return true;
        }
        for (const match of safetyText.matchAll(AGGRESSIVE_ACTION_PATTERN)) {
            const end = match.index! + match[0].length;
            if (isExplicitAvoidance(safetyText.slice(end))) continue;
            // An avoidActions label names what to avoid; it must not explicitly urge the action.
            const bareAction = /^(?:(?:相手|他人)(?:を|に))?(?:殴打する|殴る|蹴る|脅す|晒す|仕返し|復讐|追い詰める)[。.!！？?]?\s*$/u.test(text);
            if (avoidedLabel && bareAction && !DIRECT_INSTRUCTION_PATTERN.test(text)) continue;
            // Preserve the existing deny behavior outside the specific avoided/negated cases.
            return true;
        }
    return false;
}

function isExplicitAvoidance(suffix: string): boolean {
    // Only complete affirmative avoidance endings are allowed. Unknown continuations stay denied.
    return /^(?:こと|の)?(?:は|を)?(?:避ける|避けましょう|控える|控えましょう|やめる|やめましょう|しない|ない)[。.!！？?]?\s*$/u.test(suffix);
}

function maskDiscussedQuotes(text: string): string {
    // Narrow complete diagnostic denials preserve benign controls; continuations
    // or instructions to reverse the denial remain subject to assertion checks.
    if (/^we cannot conclude that (?:the person|your partner|he|she|they|you) (?:has|have|is|are) (?:a )?(?:personality disorder|psychopath|depression)[.!?]?\s*$/iu.test(text)
        || /^"(?:the person|your partner|he|she|they|you) (?:has|have|is|are) (?:a )?(?:personality disorder|psychopath|depression)" cannot be concluded[.!?]?\s*$/iu.test(text)) {
        return "Explicit diagnostic denial";
    }
    return text.replace(/[「『]([^」』]*)[」』]/gu, (quote, _content: string, offset: number) => {
        const suffix = text.slice(offset + quote.length);
        // Only a complete standalone denial is exempt; unknown prefix/continuation stays denied.
        // The optional neutral sentence preserves the existing benign-warning regression exactly.
        const standaloneQuote = text.slice(0, offset).trim() === "";
        const explicitDisclaimer = /^と(?:は(?:言え|断定でき)ません|断定(?:する)?(?:ことは)?(?:できません|しません)|決めつけ(?:る)?(?:ことは)?(?:できません|ません))(?:[。.!！？?]\s*入力の範囲で状況を整理してください)?[。.!！？?]?\s*$/u.test(suffix);
        return standaloneQuote && explicitDisclaimer ? "引用内容" : quote;
    });
}
