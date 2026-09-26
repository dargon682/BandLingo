import fetch from '@system.fetch';
import storage from '../storage';

/**
 * 增加AI词库计数
 */
async function incrementAICount() {
  try {
    storage.get({
      key: 'ai_word_count',
      default: '0',
      success: (data) => {
        const count = parseInt(data) || 0;
        storage.set({
          key: 'ai_word_count',
          value: String(count + 1)
        });
        console.log('AI词库计数更新为:', count + 1);
      },
      fail: () => {
        storage.set({
          key: 'ai_word_count',
          value: '1'
        });
        console.log('AI词库计数初始化为: 1');
      }
    });
  } catch (error) {
    console.error('更新AI词库计数失败:', error);
  }
}

/**
 * AI词典查询服务 - 直接使用fetch.fetch调用KIMI API
 * @param {string} word - 要查询的单词
 * @param {boolean} isChinese - 是否为中文输入
 * @returns {Promise<string>} AI返回的释义
 */
export async function queryAI(word, isChinese = false) {
  try {
    const systemPrompt = isChinese 
      ? `你是一个专业的英汉词典助手。请为中文词"${word}"提供准确的英文翻译和解释。
请按照以下格式回复：
${word} - [英文翻译1], [英文翻译2], [英文翻译3]
解释：[简要的用法说明，不超过100字]

要求：
1. 提供1-3个最常用的英文翻译
2. 简要说明词性和用法
3. 解释控制在100字以内，适合小屏设备显示
4. 回复要简洁明了，重点突出`
      : `你是一个专业的汉英词典助手。请为英文单词"${word}"提供准确的中文翻译和解释。
请按照以下格式回复：
${word} - [中文释义1], [中文释义2], [中文释义3]
解释：[简要的用法说明，不超过100字]

要求：
1. 提供1-3个最常用的中文释义
2. 简要说明词性和用法
3. 解释控制在100字以内，适合小屏设备显示
4. 回复要简洁明了，重点突出`;

    console.log('开始AI查询:', word);
    
    // 构建请求数据 - 参考browser.ux中的KIMI API调用格式
    const requestData = {
      model: 'moonshot-v1-8k',
      messages: [
        {
          role: 'system',
          content: '你是一个专业的AI助手，擅长词典翻译和解释。'
        },
        {
          role: 'user',
          content: systemPrompt
        }
      ],
      temperature: 0.3,
      max_tokens: 4096,
      top_p: 1,
      stream: false
    };

    // 使用fetch.fetch直接调用API - 参考browser.ux的实现
    return new Promise((resolve, reject) => {
      fetch.fetch({
        url: 'https://api.moonshot.cn/v1/chat/completions',
        method: 'POST',
        header: {
          'Authorization': 'Bearer sk-m6ECd02wFOXVTLHRzO3yjwlQTsGnreYsGwHh5GFf0CsvvuEH',
          'Content-Type': 'application/json'
        },
        data: JSON.stringify(requestData),
        success: (response) => {
          try {
            console.log('KIMI API响应成功:', response);
            console.log('KIMI response.data类型:', typeof response.data);
            console.log('KIMI response.data内容:', response.data);
            
            // 处理响应数据 - 参考browser.ux中的处理逻辑
            let jsonResponse;
            
            if (typeof response.data === 'object') {
              // 如果已经是对象，直接使用
              jsonResponse = response.data;
              console.log('KIMI 直接使用对象响应:', jsonResponse);
            } else if (typeof response.data === 'string') {
              // 如果是字符串，尝试解析
              try {
                jsonResponse = JSON.parse(response.data);
                console.log('KIMI 字符串解析成功:', jsonResponse);
              } catch (parseError) {
                console.error('KIMI 字符串解析失败:', parseError);
                reject(new Error('响应解析失败: 无效的JSON格式'));
                return;
              }
            } else {
              console.error('KIMI 未知响应类型:', typeof response.data);
              reject(new Error(`响应类型异常: ${typeof response.data}`));
              return;
            }
            
            // 处理解析后的JSON - 参考browser.ux中的逻辑
            if (jsonResponse && jsonResponse.choices && jsonResponse.choices.length > 0) {
              const choice = jsonResponse.choices[0];
              if (choice && choice.message && choice.message.content) {
                const content = choice.message.content;
                console.log('AI查询成功:', content);
                incrementAICount();
                resolve(content.trim());
              } else if (choice && choice.delta && choice.delta.content) {
                // 处理流式响应的delta格式
                const content = choice.delta.content;
                console.log('AI查询成功(delta):', content);
                incrementAICount();
                resolve(content.trim());
              } else if (choice && choice.text) {
                // 处理text格式的响应
                const content = choice.text;
                console.log('AI查询成功(text):', content);
                incrementAICount();
                resolve(content.trim());
              } else if (jsonResponse.content) {
                // 处理直接content格式的响应
                const content = jsonResponse.content;
                console.log('AI查询成功(direct):', content);
                incrementAICount();
                resolve(content.trim());
              } else {
                console.error('KIMI API响应结构异常:', jsonResponse);
                console.error('KIMI choice对象:', choice);
                
                // 尝试从choice中提取任何可用的文本内容
                let extractedText = '';
                if (choice) {
                  for (const key in choice) {
                    if (typeof choice[key] === 'string' && choice[key].length > 0) {
                      extractedText = choice[key];
                      break;
                    }
                  }
                }
                if (extractedText) {
                  console.log('AI查询成功(extracted):', extractedText);
                  incrementAICount();
                  resolve(extractedText.trim());
                } else {
                  reject(new Error('响应结构异常: 缺少message.content'));
                }
              }
            } else {
              console.error('KIMI API响应结构异常:', jsonResponse);
              // 尝试直接从响应中提取内容
              if (jsonResponse && jsonResponse.content) {
                const content = jsonResponse.content;
                console.log('AI查询成功(direct content):', content);
                incrementAICount();
                resolve(content.trim());
              } else if (jsonResponse && jsonResponse.text) {
                const content = jsonResponse.text;
                console.log('AI查询成功(direct text):', content);
                incrementAICount();
                resolve(content.trim());
              } else {
                reject(new Error('响应结构异常: 缺少choices数组'));
              }
            }
          } catch (e) {
            console.error('解析KIMI响应失败:', e);
            console.error('KIMI 完整响应对象:', response);
            reject(new Error(`解析失败: ${e.message}`));
          }
        },
        fail: (error, code) => {
          console.error('KIMI API请求失败:', { error, code });
          console.error('KIMI 请求URL:', 'https://api.moonshot.cn/v1/chat/completions');
          console.error('KIMI 请求参数:', requestData);
          
          let errorMessage = `请求失败 (${code})`;
          if (code === 6) {
            errorMessage = 'KIMI API连接超时，请检查网络或API地址';
          } else if (code === 401) {
            errorMessage = 'KIMI API Key无效，请检查配置';
          } else if (code === 404) {
            errorMessage = 'KIMI API地址不存在，请检查配置';
          }
          
          reject(new Error(errorMessage));
        }
      });
    });
  } catch (error) {
    console.error('AI查询失败:', error);
    throw new Error(`AI查询服务暂时不可用: ${error.message}`);
  }
}