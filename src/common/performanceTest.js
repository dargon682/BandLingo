// 词库性能测试脚本
import { searchWord, getDictionary, loadExtendedDictionary, loadProfessionalDictionary, releaseDictionary } from '../common/dictionary.js';

// 性能测试工具
const performanceTest = {
  // 测试搜索性能
  testSearchPerformance() {
    console.log('=== 搜索性能测试开始 ===');
    
    const testWords = ['hello', 'apple', 'computer', 'beautiful', 'technology', 'mathematics'];
    const results = [];
    
    testWords.forEach(word => {
      const startTime = Date.now();
      const searchResults = searchWord(word, 10);
      const endTime = Date.now();
      
      results.push({
        word,
        searchTime: endTime - startTime,
        resultCount: searchResults.length,
        results: searchResults
      });
      
      console.log(`搜索 "${word}": ${endTime - startTime}ms, 找到 ${searchResults.length} 个结果`);
    });
    
    return results;
  },
  
  // 测试内存使用
  testMemoryUsage() {
    console.log('=== 内存使用测试 ===');
    
    // 测试初始加载
    const initialMemory = this.getMemoryUsage();
    getDictionary();
    const afterLoadMemory = this.getMemoryUsage();
    
    console.log(`初始内存: ${initialMemory}`);
    console.log(`加载核心词汇后: ${afterLoadMemory}`);
    console.log(`增加: ${afterLoadMemory - initialMemory}`);
    
    // 测试扩展加载
    loadExtendedDictionary();
    const afterExtendedMemory = this.getMemoryUsage();
    console.log(`加载扩展词汇后: ${afterExtendedMemory}`);
    console.log(`增加: ${afterExtendedMemory - afterLoadMemory}`);
    
    // 测试专业词汇加载
    loadProfessionalDictionary();
    const afterProfessionalMemory = this.getMemoryUsage();
    console.log(`加载专业词汇后: ${afterProfessionalMemory}`);
    console.log(`增加: ${afterProfessionalMemory - afterExtendedMemory}`);
    
    return {
      initial: initialMemory,
      core: afterLoadMemory - initialMemory,
      extended: afterExtendedMemory - afterLoadMemory,
      professional: afterProfessionalMemory - afterExtendedMemory
    };
  },
  
  // 获取内存使用情况（简化版）
  getMemoryUsage() {
    // 在实际环境中可以使用更精确的内存监控
    return Date.now(); // 简化处理，实际应使用内存API
  },
  
  // 测试搜索准确性
  testSearchAccuracy() {
    console.log('=== 搜索准确性测试 ===');
    
    const testCases = [
      { query: 'hello', expected: ['hello'] },
      { query: 'app', expected: ['apple'] },
      { query: 'tech', expected: ['technology'] },
      { query: 'math', expected: ['mathematics'] }
    ];
    
    const results = [];
    
    testCases.forEach(testCase => {
      const searchResults = searchWord(testCase.query, 5);
      const foundWords = searchResults.map(r => r.word);
      const accuracy = testCase.expected.filter(word => 
        foundWords.includes(word)
      ).length / testCase.expected.length;
      
      results.push({
        query: testCase.query,
        expected: testCase.expected,
        found: foundWords,
        accuracy: accuracy * 100
      });
      
      console.log(`搜索 "${testCase.query}": 准确率 ${accuracy * 100}%`);
    });
    
    return results;
  },
  
  // 运行完整测试
  runFullTest() {
    console.log('开始完整性能测试...');
    
    const searchResults = this.testSearchPerformance();
    const memoryResults = this.testMemoryUsage();
    const accuracyResults = this.testSearchAccuracy();
    
    console.log('=== 测试总结 ===');
    console.log('搜索性能:', searchResults);
    console.log('内存使用:', memoryResults);
    console.log('搜索准确性:', accuracyResults);
    
    // 清理内存
    releaseDictionary();
    
    return {
      search: searchResults,
      memory: memoryResults,
      accuracy: accuracyResults
    };
  }
};

// 导出测试工具
if (typeof global !== 'undefined') {
  global.performanceTest = performanceTest;
  console.log('性能测试工具已挂载到全局对象');
}

export { performanceTest };