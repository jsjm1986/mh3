class PPTExporter {
    constructor() {
        this.pptx = new PptxGenJS();
        this.slideWidth = 10;
        this.slideHeight = 5.625;
        
        // PPT主题配置
        this.theme = {
            title: {
                fontSize: 32,
                color: "363636",
                bold: true
            },
            subtitle: {
                fontSize: 20,
                color: "666666"
            },
            body: {
                fontSize: 16,
                color: "404040",
                breakLine: true
            },
            accent: {
                color: "409EFF"
            }
        };
    }

    // 创建封面
    addCoverSlide(title) {
        console.log('创建封面页...');
        const slide = this.pptx.addSlide();
        
        // 添加标题
        slide.addText(title, {
            x: 0.5,
            y: 2,
            w: 9,
            h: 1,
            fontSize: 44,
            color: this.theme.accent.color,
            bold: true,
            align: 'center'
        });

        // 添加副标题
        slide.addText("视频脚本", {
            x: 0.5,
            y: 3.2,
            w: 9,
            h: 0.5,
            fontSize: 24,
            color: this.theme.subtitle.color,
            align: 'center'
        });

        // 添加日期
        const date = new Date().toLocaleDateString('zh-CN');
        slide.addText(date, {
            x: 0.5,
            y: 4,
            w: 9,
            h: 0.5,
            fontSize: 16,
            color: this.theme.subtitle.color,
            align: 'center'
        });
    }

    // 创建场景概述页
    addSceneOverviewSlide(scenes) {
        console.log('创建场景概述页...');
        const slide = this.pptx.addSlide();
        
        // 添加标题
        slide.addText("场景概述", {
            x: 0.5,
            y: 0.5,
            w: 9,
            h: 0.8,
            ...this.theme.title
        });

        // 创建场景列表
        const sceneTexts = scenes.map((scene, index) => ({
            text: `场景 ${index + 1}: ${scene.description.substring(0, 50)}${scene.description.length > 50 ? '...' : ''}\n` +
                  `对白: ${scene.dialogue.substring(0, 50)}${scene.dialogue.length > 50 ? '...' : ''}`,
            options: {
                fontSize: this.theme.body.fontSize,
                color: this.theme.body.color,
                bullet: { type: 'number', color: this.theme.accent.color },
                breakLine: true
            }
        }));

        console.log('场景概述列表:', sceneTexts);

        // 添加场景列表
        slide.addText(sceneTexts, {
            x: 0.5,
            y: 1.5,
            w: 9,
            h: 3.5,
            lineSpacing: 32,
            breakLine: true
        });
    }

    // 创建场景详细页
    addSceneDetailSlide(scene) {
        console.log(`创建场景${scene.sceneNumber}详细页...`);
        const slide = this.pptx.addSlide();
        
        // 添加场景标题
        slide.addText(`场景 ${scene.sceneNumber}`, {
            x: 0.5,
            y: 0.5,
            w: 9,
            h: 0.8,
            ...this.theme.title
        });

        // 添加场景内容
        const contentItems = [
            { title: "场景描述", content: scene.description },
            { title: "动作指示", content: scene.action },
            { title: "镜头建议", content: scene.cameraShot }
        ];

        let yPos = 1.5;
        contentItems.forEach(item => {
            console.log(`添加${item.title}:`, item.content);
            
            // 添加小标题
            slide.addText(item.title, {
                x: 0.5,
                y: yPos,
                w: 9,
                h: 0.4,
                fontSize: this.theme.subtitle.fontSize,
                color: this.theme.accent.color,
                bold: true
            });

            // 添加内容
            slide.addText(item.content || '暂无内容', {
                x: 0.5,
                y: yPos + 0.4,
                w: 9,
                h: 0.8,
                fontSize: this.theme.body.fontSize,
                color: this.theme.body.color,
                breakLine: true,
                lineSpacing: 16
            });

            yPos += 1.3;
        });
    }

    // 创建对白页
    addDialogueSlide(scene) {
        console.log(`创建场景${scene.sceneNumber}对白页...`);
        const slide = this.pptx.addSlide();
        
        // 添加标题
        slide.addText(`场景 ${scene.sceneNumber} - 对白`, {
            x: 0.5,
            y: 0.5,
            w: 9,
            h: 0.8,
            ...this.theme.title
        });

        // 添加对白内容
        const dialogue = scene.dialogue || '暂无对白';
        console.log('对白内容:', dialogue);
        
        // 创建格式化的对白内容
        const formattedDialogue = dialogue.split('\n').map(line => ({
            text: line,
            options: {
                ...this.theme.body,
                breakLine: true,
                bullet: line.includes('：') // 如果是人物对白就添加项目符号
            }
        }));

        // 添加对白文本
        slide.addText(formattedDialogue, {
            x: 0.5,
            y: 1.5,
            w: 9,
            h: 3,
            fontSize: this.theme.body.fontSize,
            color: this.theme.body.color,
            lineSpacing: 32,
            bullet: { indent: 10 }
        });

        // 添加时长和背景音乐信息
        const footer = [
            `时长：${scene.duration || '未指定'}`,
            `背景音乐：${scene.bgm || '未指定'}`
        ].join('\n');

        slide.addText(footer, {
            x: 0.5,
            y: 4.5,
            w: 9,
            h: 0.8,
            fontSize: 14,
            color: this.theme.subtitle.color,
            italic: true,
            breakLine: true
        });
    }

    // 验证场景数据
    validateScene(scene) {
        console.log('验证场景数据:', scene);
        
        const requiredFields = ['description', 'dialogue', 'action', 'cameraShot', 'duration', 'bgm'];
        const missingFields = requiredFields.filter(field => !scene[field]);
        
        if (missingFields.length > 0) {
            console.warn(`场景${scene.sceneNumber}缺少字段:`, missingFields);
        }

        // 清理和验证每个字段
        const cleanField = (value) => {
            if (!value || typeof value !== 'string') return '';
            return value.trim();
        };
        
        const validatedScene = {
            ...scene,
            sceneNumber: scene.sceneNumber || 1,
            description: cleanField(scene.description) || '暂无描述',
            dialogue: cleanField(scene.dialogue) || '暂无对白',
            action: cleanField(scene.action) || '暂无动作指示',
            cameraShot: cleanField(scene.cameraShot) || '暂无镜头建议',
            duration: cleanField(scene.duration) || '未指定',
            bgm: cleanField(scene.bgm) || '未指定'
        };

        console.log('验证后的场景数据:', validatedScene);
        return validatedScene;
    }

    // 导出完整PPT
    async exportPPT(title, scenes) {
        try {
            console.log('开始生成PPT...');
            console.log('标题:', title);
            console.log('原始场景数据:', scenes);

            if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
                throw new Error('没有有效的场景数据可供导出');
            }

            // 验证和清理所有场景数据
            const validatedScenes = scenes.map((scene, index) => 
                this.validateScene({
                    ...scene,
                    sceneNumber: index + 1
                })
            );

            console.log('验证后的场景数据:', validatedScenes);

            // 设置PPT属性
            this.pptx.layout = 'LAYOUT_WIDE';
            this.pptx.author = '故事转视频脚本系统';
            this.pptx.title = title || '未命名脚本';

            // 添加封面
            this.addCoverSlide(title);
            
            // 添加场景概述
            this.addSceneOverviewSlide(validatedScenes);

            // 为每个场景添加详细页和对白页
            validatedScenes.forEach(scene => {
                this.addSceneDetailSlide(scene);
                this.addDialogueSlide(scene);
            });

            // 导出文件
            const fileName = `${title || '未命名脚本'}_视频脚本_${new Date().toISOString().split('T')[0]}.pptx`;
            console.log('准备导出文件:', fileName);
            
            await this.pptx.writeFile({ fileName });
            console.log('PPT导出成功');
            return fileName;
        } catch (error) {
            console.error('PPT生成错误:', error);
            throw error;
        }
    }
} 