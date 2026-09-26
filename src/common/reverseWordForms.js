// 反向单词形态映射 - 将形态词映射回基础单词
// 这个文件会自动生成，不需要手动维护

import { wordForms } from './wordForms';

// 创建反向映射
const reverseWordForms = {};

// 遍历所有单词及其形态
for (const baseWord in wordForms) {
  const forms = wordForms[baseWord];
  
  // 遍历每个形态类型
  for (const formType in forms) {
    const formWord = forms[formType];
    
    // 如果这个形态词还没有被映射过，则创建映射
    if (!reverseWordForms[formWord]) {
      reverseWordForms[formWord] = baseWord;
    }
  }
}

export { reverseWordForms };