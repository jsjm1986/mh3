class PPTExporter {
    constructor() {
        this.pptx = null;
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

    // 处理颜色值
    processColor(color) {
        if (!color) return "000000";
        
        // 如果已经是6位十六进制颜色，直接返回
        if (/^[0-9A-F]{6}$/i.test(color)) {
            return color;
        }
        
        // 如果是带#的十六进制颜色，去掉#
        if (color.startsWith('#')) {
            return color.substring(1);
        }
        
        // 如果是预设的主题颜色名称，转换为对应的十六进制颜色
        const themeColors = {
            '自然森林': '228B22',
            '深海蓝': '00688B',
            '天空蓝': '409EFF',
            '珊瑚红': 'FF7F50',
            '薰衣草': 'E6E6FA',
            '象牙白': 'FFFFF0',
            '石墨黑': '363636'
        };
        
        return themeColors[color] || "000000";
    }

    // 初始化PPT
    initPPT(title) {
        this.pptx = new PptxGenJS();
        
        // 设置PPT属性
        this.pptx.author = '故事转视频脚本系统';
        this.pptx.company = '故事转视频脚本系统';
        this.pptx.subject = title;
        this.pptx.title = title;
        
        // 设置默认布局
        this.pptx.layout = 'LAYOUT_16x9';
        this.pptx.defineLayout({
            name: 'LAYOUT_16x9',
            width: 10,
            height: 5.625
        });
    }

    // 根据结构数据生成PPT
    async generateFromStructure(structure) {
        try {
            this.initPPT(structure.title);

            // 处理主题颜色
            if (structure.theme) {
                this.theme = {
                    ...this.theme,
                    accent: {
                        color: this.processColor(structure.theme.primary || '409EFF')
                    },
                    title: {
                        ...this.theme.title,
                        color: this.processColor(structure.theme.text || '363636')
                    },
                    subtitle: {
                        ...this.theme.subtitle,
                        color: this.processColor(structure.theme.secondary || '666666')
                    }
                };
            }

            // 生成每个幻灯片
            for (const slide of structure.slides) {
                switch (slide.type) {
                    case 'cover':
                        await this.createCoverSlide(slide);
                        break;
                    case 'overview':
                        await this.createOverviewSlide(slide);
                        break;
                    case 'scene':
                        await this.createSceneSlides(slide);
                        break;
                }
            }

            // 生成预览
            const data = await this.pptx.write('base64');
            
            // 创建预览容器
            let previewContainer = document.querySelector('.ppt-preview');
            if (!previewContainer) {
                previewContainer = document.createElement('div');
                previewContainer.className = 'ppt-preview';
                document.body.appendChild(previewContainer);
            }

            // 显示预览
            previewContainer.innerHTML = `
                <div class="preview-overlay"></div>
                <div class="preview-content">
                    <div class="preview-header">
                        <h3>PPT预览</h3>
                        <button class="preview-close" onclick="document.querySelector('.ppt-preview').style.display='none'">×</button>
                    </div>
                    <div class="preview-body">
                        <iframe src="data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${data}"></iframe>
                    </div>
                </div>
            `;
            previewContainer.style.display = 'block';

            return true;
        } catch (error) {
            console.error('生成PPT错误:', error);
            throw new Error('生成PPT失败：' + error.message);
        }
    }

    // 创建封面页
    async createCoverSlide(slideData) {
        const slide = this.pptx.addSlide();
        const { content, style } = slideData;

        // 处理主题颜色
        const themeColor = this.processColor(style?.theme || this.theme.accent.color);

        // 添加标题
        slide.addText(content.title, {
            x: 0.5,
            y: 2,
            w: 9,
            h: 1,
            fontSize: 44,
            color: themeColor,
            bold: true,
            align: 'center'
        });

        // 添加副标题
        if (content.subtitle) {
            slide.addText(content.subtitle, {
                x: 0.5,
                y: 3.2,
                w: 9,
                h: 0.5,
                fontSize: 24,
                color: this.processColor(this.theme.subtitle.color),
                align: 'center'
            });
        }

        // 添加描述
        if (content.description) {
            slide.addText(content.description, {
                x: 0.5,
                y: 4,
                w: 9,
                h: 0.8,
                fontSize: 16,
                color: this.processColor(this.theme.subtitle.color),
                align: 'center'
            });
        }
    }

    // 创建概述页
    async createOverviewSlide(slideData) {
        const slide = this.pptx.addSlide();
        const { content } = slideData;

        // 添加标题
        slide.addText(content.title, {
            x: 0.5,
            y: 0.5,
            w: 9,
            h: 0.8,
            fontSize: this.theme.title.fontSize,
            color: this.processColor(this.theme.title.color),
            bold: true
        });

        // 添加概述项目
        if (content.items && content.items.length > 0) {
            const items = content.items.map(item => ({
                text: item,
                options: {
                    fontSize: this.theme.body.fontSize,
                    color: this.processColor(this.theme.body.color),
                    bullet: { type: 'number', color: this.processColor(this.theme.accent.color) },
                    breakLine: true
                }
            }));

            slide.addText(items, {
                x: 0.5,
                y: 1.5,
                w: 9,
                h: 3.5,
                lineSpacing: 32
            });
        }
    }

    // 创建场景相关的幻灯片
    async createSceneSlides(slideData) {
        const { content, sceneNumber } = slideData;

        // 创建场景描述页
        if (content.description) {
            const descSlide = this.pptx.addSlide();
            descSlide.addText(`场景 ${sceneNumber} - 场景描述`, {
                x: 0.5,
                y: 0.5,
                w: 9,
                h: 0.8,
                fontSize: this.theme.title.fontSize,
                color: this.processColor(this.theme.title.color),
                bold: true
            });

            descSlide.addText(content.description, {
                x: 0.5,
                y: 1.5,
                w: 9,
                h: 3.5,
                fontSize: this.theme.body.fontSize,
                color: this.processColor(this.theme.body.color),
                breakLine: true
            });
        }

        // 创建分镜头页
        if (content.shots && content.shots.length > 0) {
            const shotSlide = this.pptx.addSlide();
            shotSlide.addText(`场景 ${sceneNumber} - 分镜头`, {
                x: 0.5,
                y: 0.5,
                w: 9,
                h: 0.8,
                fontSize: this.theme.title.fontSize,
                color: this.processColor(this.theme.title.color),
                bold: true
            });
            
            const shots = content.shots.map(shot => ({
                text: shot,
                options: {
                    fontSize: this.theme.body.fontSize,
                    color: this.processColor(this.theme.body.color),
                    bullet: true,
                    breakLine: true
                }
            }));

            shotSlide.addText(shots, {
                x: 0.5,
                y: 1.5,
                w: 9,
                h: 3.5,
                lineSpacing: 32
            });
        }

        // 创建对白页
        if (content.dialogues && content.dialogues.length > 0) {
            const dialogueSlide = this.pptx.addSlide();
            dialogueSlide.addText(`场景 ${sceneNumber} - 对白`, {
                x: 0.5,
                y: 0.5,
                w: 9,
                h: 0.8,
                fontSize: this.theme.title.fontSize,
                color: this.processColor(this.theme.title.color),
                bold: true
            });

            const dialogues = content.dialogues.map(dialogue => ({
                text: dialogue,
                options: {
                    fontSize: this.theme.body.fontSize,
                    color: this.processColor(this.theme.body.color),
                    bullet: dialogue.includes('：'),
                    indent: dialogue.includes('：') ? 20 : 0,
                    breakLine: true
                }
            }));

            dialogueSlide.addText(dialogues, {
                x: 0.5,
                y: 1.5,
                w: 9,
                h: 3.5,
                lineSpacing: 32
            });
        }

        // 创建视觉效果页
        if (content.visualEffects && content.visualEffects.length > 0) {
            const effectSlide = this.pptx.addSlide();
            effectSlide.addText(`场景 ${sceneNumber} - 视觉效果`, {
                x: 0.5,
                y: 0.5,
                w: 9,
                h: 0.8,
                fontSize: this.theme.title.fontSize,
                color: this.processColor(this.theme.title.color),
                bold: true
            });

            const effects = content.visualEffects.map(effect => ({
                text: effect,
                options: {
                    fontSize: this.theme.body.fontSize,
                    color: this.processColor(this.theme.body.color),
                    bullet: true,
                    breakLine: true
                }
            }));

            effectSlide.addText(effects, {
                x: 0.5,
                y: 1.5,
                w: 9,
                h: 3.5,
                lineSpacing: 32
            });
        }
    }
} 