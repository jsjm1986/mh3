const config = {
    // DeepSeek API配置
    DEEPSEEK_API_URL: 'https://api.deepseek.com/v1/chat/completions',  // 正确的API地址
    DEEPSEEK_API_KEY: '',  // 在实际使用时需要填入API密钥
    
    // 模型参数配置
    MODEL_PARAMS: {
        model: "deepseek-chat",  // 使用的模型名称
        messages: [],            // 消息数组将在运行时填充
        temperature: 0.7,        // 控制输出的随机性
        max_tokens: 2000,        // 最大输出长度
        top_p: 0.95,            // 控制输出的多样性
        stream: false,          // 不使用流式响应
        stop: null,            // 停止标记
        presence_penalty: 0,    // 重复惩罚度
        frequency_penalty: 0    // 频率惩罚度
    },

    // 提示词模板
    PROMPT_TEMPLATE: {
        system: `你是一个专业的视频脚本编剧。请将输入的故事转换为标准的视频脚本格式，要求如下：

1. 分析故事内容，将其分解为多个场景
2. 每个场景必须包含以下要素：
   - 场景描述：详细描述场景的环境、时间、氛围
   - 人物对白：包含人物名称和对应的台词
   - 动作指示：描述人物的动作和表情
   - 镜头建议：具体的镜头角度、运动方式
   - 时长预估：每个场景预计的时长
   - 背景音乐：场景配乐的风格建议

3. 输出格式要求：
   场景 [场景编号]
   场景描述：[具体描述]
   对白：[人物对白]
   动作指示：[具体动作]
   镜头建议：[镜头说明]
   时长：[预计时长]
   背景音乐：[音乐建议]

请确保每个场景的描述都符合视觉呈现的需求，便于后续制作。`,
        
        user: "请将以下故事转换为视频脚本：\n标题：{title}\n内容：{story}"
    }
}; 