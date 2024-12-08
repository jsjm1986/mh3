// 在Vue实例之前添加工具函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const retryWithDelay = async (fn, retries = 3, delay = 2000) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) throw error;
            console.log(`尝试失败，${delay/1000}秒后重试...`, error);
            await sleep(delay);
        }
    }
};

// 资源加载检查
const checkResourceLoading = () => {
    return new Promise((resolve, reject) => {
        // 检查Element UI是否加载完成
        if (typeof ELEMENT === 'undefined') {
            reject(new Error('Element UI 未能正确加载'));
            return;
        }

        // 检查Vue是否加载完成
        if (typeof Vue === 'undefined') {
            reject(new Error('Vue 未能正确加载'));
            return;
        }

        // 检查pptxgen是否加载完成
        if (typeof PptxGenJS === 'undefined') {
            reject(new Error('PPTXGenJS 未能正确加载'));
            return;
        }

        // 检查PPTExporter是否加载完成
        if (typeof PPTExporter === 'undefined') {
            reject(new Error('PPTExporter 未能正确加载'));
            return;
        }

        resolve();
    });
};

// 创建Vue实例前检查资源
checkResourceLoading().then(() => {
    // 创建Vue实例
    new Vue({
        el: '#app',
        data: {
            storyTitle: '',
            storyContent: '',
            scriptContent: null,
            activeIndex: '1',
            loading: false,
            exportLoading: false,
            projects: [],
            currentProject: null,
            
            // API设置相关
            settingsVisible: false,
            apiSettings: {
                apiKey: localStorage.getItem('deepseek_api_key') || '',
                temperature: 0.7,
                maxTokens: 2000
            },

            // 当前场景数据
            currentScenes: [],

            // API状态
            apiStatus: {
                isConnecting: false,
                lastError: null,
                retryCount: 0
            },

            // UI状态
            isMobile: window.innerWidth <= 768,
            isMenuOpen: false,
            activeSection: 'story-input',

            // 项目管理相关
            projectDialogVisible: false,
            editingProject: {
                id: null,
                title: '',
                content: '',
                script: null,
                scenes: [],
                lastModified: null
            }
        },
        computed: {
            // 计算当前视图的标题
            currentViewTitle() {
                const titles = {
                    '1': '项目管理',
                    '2': '故事输入',
                    '3': '脚本生成',
                    '4': '脚本编辑',
                    '5': 'PPT导出'
                };
                return titles[this.activeIndex] || '故事转视频脚本系统';
            }
        },
        methods: {
            // 切换菜单
            toggleMenu() {
                this.isMenuOpen = !this.isMenuOpen;
                if (this.isMenuOpen) {
                    document.body.style.overflow = 'hidden';
                } else {
                    document.body.style.overflow = '';
                }
            },

            // 处理菜单选择
            handleSelect(index) {
                this.activeIndex = index;
                if (this.isMobile) {
                    this.toggleMenu();
                }
            },

            // 处理窗口大小变化
            handleResize() {
                this.isMobile = window.innerWidth <= 768;
                if (!this.isMobile && this.isMenuOpen) {
                    this.isMenuOpen = false;
                    document.body.style.overflow = '';
                }
            },

            // 显示设置对话框
            showSettings() {
                this.settingsVisible = true;
            },

            // 保存设置
            saveSettings() {
                localStorage.setItem('deepseek_api_key', this.apiSettings.apiKey);
                localStorage.setItem('deepseek_temperature', this.apiSettings.temperature);
                localStorage.setItem('deepseek_max_tokens', this.apiSettings.maxTokens);
                
                // 更新配置
                config.MODEL_PARAMS.temperature = this.apiSettings.temperature;
                config.MODEL_PARAMS.max_tokens = this.apiSettings.maxTokens;
                
                this.settingsVisible = false;
                this.$message.success('设置已保存');
            },

            // 生成脚本
            async generateScript() {
                // 输入验证
                if (!this.storyTitle) {
                    this.$message.warning('请输入故事标题');
                    return;
                }
                if (!this.storyContent) {
                    this.$message.warning('请输入故事内容');
                    return;
                }

                // API密钥验证
                if (!this.apiSettings.apiKey) {
                    this.$message.warning('请先配置API密钥');
                    this.showSettings();
                    return;
                }

                this.loading = true;
                this.apiStatus.isConnecting = true;
                this.apiStatus.lastError = null;
                
                try {
                    // 调用API生成脚本
                    const response = await this.callDeepSeekAPI(this.storyContent);
                    this.scriptContent = this.formatScript(response);
                    this.currentScenes = response.scenes;

                    // 保存到当前项目
                    if (this.currentProject) {
                        const projects = JSON.parse(localStorage.getItem('projects') || '[]');
                        const index = projects.findIndex(p => p.id === this.currentProject.id);
                        if (index !== -1) {
                            projects[index] = {
                                ...projects[index],
                                script: this.scriptContent,
                                scenes: this.currentScenes,
                                lastModified: new Date().toISOString()
                            };
                            localStorage.setItem('projects', JSON.stringify(projects));
                            this.projects = projects;
                        }
                    }

                    this.$message.success('脚本生成成功！');
                } catch (error) {
                    console.error('生成脚本错误:', error);
                    this.$message.error(error.message);
                } finally {
                    this.loading = false;
                }
            },

            // 调用DeepSeek API
            async callDeepSeekAPI(content) {
                try {
                    console.log('开始调用API...');
                    
                    // 准备消息数组
                    const messages = [
                        {
                            role: 'system',
                            content: config.PROMPT_TEMPLATE.system
                        },
                        {
                            role: 'user',
                            content: config.PROMPT_TEMPLATE.user
                                .replace('{title}', this.storyTitle)
                                .replace('{story}', content)
                        }
                    ];

                    // 准备请求数据
                    const requestData = {
                        ...config.MODEL_PARAMS,
                        messages,
                        stream: false
                    };

                    console.log('API请求数据:', requestData);

                    // 使用重试机制发送API请求
                    const response = await retryWithDelay(async () => {
                        try {
                            const res = await fetch(config.DEEPSEEK_API_URL, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${this.apiSettings.apiKey}`,
                                    'Accept': 'application/json'
                                },
                                body: JSON.stringify(requestData)
                            });

                            if (!res.ok) {
                                let errorMessage = `API请求失败: ${res.status}`;
                                try {
                                    const errorData = await res.json();
                                    errorMessage = errorData.error?.message || errorMessage;
                                } catch (e) {
                                    console.error('解析错误响应失败:', e);
                                }
                                throw new Error(errorMessage);
                            }

                            const data = await res.json();
                            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                                throw new Error('API响应格式不正确');
                            }

                            return data;
                        } catch (error) {
                            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                                throw new Error('无法连接到API服务器，请检查：\n1. API密钥是否正确\n2. 网络连接是否正常\n3. API服务是否可用');
                            }
                            throw error;
                        }
                    }, 3, 2000); // 3次重试，每次间隔2秒

                    console.log('API响应数据:', response);
                    return this.parseAPIResponse(response);
                } catch (error) {
                    console.error('API调用错误:', error);
                    // 根据错误类型提供更具体的错误信息
                    if (error.message.includes('401')) {
                        throw new Error('API密钥无效或已过期，请检查API密钥设置');
                    } else if (error.message.includes('429')) {
                        throw new Error('API调用次数超限，请稍后重试');
                    } else if (error.message.includes('500')) {
                        throw new Error('API服务器内部错误，请稍后重试');
                    } else if (error.message.includes('503')) {
                        throw new Error('API服务暂时不可用，请稍后重试');
                    } else {
                        throw error;
                    }
                }
            },

            // 解析API响应
            parseAPIResponse(data) {
                try {
                    const content = data.choices[0].message.content;
                    console.log('解析到的内容:', content);

                    // 将API返回的文本解析为场景对象数组
                    const scenes = this.parseScenes(content);
                    this.currentScenes = scenes; // 保存场景数据
                    return { scenes };
                } catch (error) {
                    console.error('解析API响应错误:', error);
                    throw new Error('无法解析API响应：' + error.message);
                }
            },

            // 解析场景文本
            parseScenes(content) {
                try {
                    console.log('开始解析场景文本:', content);
                    // 将文本分割为场景
                    const sceneTexts = content.split(/场景\s*\d+/).filter(text => text.trim());
                    console.log('分割后的场景数:', sceneTexts.length);

                    return sceneTexts.map((text, index) => {
                        const lines = text.trim().split('\n');
                        console.log(`解析场景 ${index + 1} 的行数:`, lines.length);
                        
                        const scene = {
                            sceneNumber: index + 1,
                            description: '',
                            dialogue: '无对白',  // 默认值改为"无对白"
                            action: '',
                            cameraShot: '',
                            duration: '',
                            bgm: ''
                        };

                        let currentField = '';
                        let currentContent = [];

                        lines.forEach(line => {
                            line = line.trim();
                            if (!line || line === '---') return;

                            // 检查是否��字段标题
                            if (line.includes('：')) {
                                // 如果有之前收集的内容，保存它
                                if (currentField && currentContent.length > 0) {
                                    scene[currentField] = currentContent.join('\n').trim();
                                    currentContent = [];
                                }

                                const [key, ...valueParts] = line.split('：');
                                const value = valueParts.join('：').trim();
                                const fieldKey = key.trim();

                                // 统一处理字段映射
                                const fieldMap = {
                                    '场景描述': 'description',
                                    '对白': 'dialogue',
                                    '动作指示': 'action',
                                    '镜头建议': 'cameraShot',
                                    '时长': 'duration',
                                    '背景音乐': 'bgm'
                                };

                                currentField = fieldMap[fieldKey];
                                if (!currentField) {
                                    console.log(`跳过未知字段: ${fieldKey} = ${value}`);
                                    return;
                                }
                                
                                if (value) {
                                    currentContent.push(value);
                                }
                            } else if (currentField) {
                                // 如果不是字段标题，而是内容的继续，添加到当前内容
                                currentContent.push(line);
                            }
                        });

                        // 保存最后一个字段的内容
                        if (currentField && currentContent.length > 0) {
                            scene[currentField] = currentContent.join('\n').trim();
                        }

                        // 处理空值和特殊值
                        if (!scene.dialogue || scene.dialogue === '') {
                            scene.dialogue = '无对白';
                        }
                        if (scene.dialogue === '无') {
                            scene.dialogue = '无对白';
                        }

                        // 确保所有必填字段都有值
                        Object.keys(scene).forEach(key => {
                            if (!scene[key] && key !== 'sceneNumber') {
                                scene[key] = key === 'dialogue' ? '无对白' : '未指定';
                            }
                        });

                        console.log(`场景 ${index + 1} 解析结果:`, scene);
                        return scene;
                    });
                } catch (error) {
                    console.error('解析场景错误:', error);
                    throw new Error('解析场景失败：' + error.message);
                }
            },

            // 格式化脚本输出
            formatScript(response) {
                let formattedScript = '';
                response.scenes.forEach(scene => {
                    formattedScript += `场景 ${scene.sceneNumber}\n`;
                    if (scene.description) formattedScript += `场景描述：${scene.description}\n`;
                    formattedScript += `对白：${scene.dialogue || '无对白'}\n`;
                    if (scene.action) formattedScript += `动作指示：${scene.action}\n`;
                    if (scene.cameraShot) formattedScript += `镜头建议：${scene.cameraShot}\n`;
                    if (scene.duration) formattedScript += `时长：${scene.duration}\n`;
                    if (scene.bgm) formattedScript += `背景音乐：${scene.bgm}\n`;
                    formattedScript += '\n---\n\n';
                });
                return formattedScript;
            },

            // 格式化日期
            formatDate(row, column) {
                const date = new Date(row.lastModified);
                const now = new Date();
                const diff = now - date;
                
                // 如果是今天
                if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
                    const hours = date.getHours().toString().padStart(2, '0');
                    const minutes = date.getMinutes().toString().padStart(2, '0');
                    return `今天 ${hours}:${minutes}`;
                }
                
                // 如果是昨天
                if (diff < 48 * 60 * 60 * 1000 && date.getDate() === now.getDate() - 1) {
                    const hours = date.getHours().toString().padStart(2, '0');
                    const minutes = date.getMinutes().toString().padStart(2, '0');
                    return `昨天 ${hours}:${minutes}`;
                }
                
                // 如果是今年
                if (date.getFullYear() === now.getFullYear()) {
                    return `${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
                }
                
                // 其他情况显示完整日期
                return `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
            },

            // 创建新项目
            createNewProject() {
                this.currentProject = null;
                this.editingProject = {
                    id: null,
                    title: '',
                    content: '',
                    script: null,
                    scenes: [],
                    lastModified: new Date().toISOString()
                };
                this.projectDialogVisible = true;
            },

            // 编辑项目
            editProject(project) {
                this.currentProject = project;
                this.editingProject = { ...project };
                this.storyTitle = project.title;
                this.storyContent = project.content;
                this.scriptContent = project.script;
                this.currentScenes = project.scenes || [];
                this.activeIndex = '2'; // 切换到故事输入页面
                this.projectDialogVisible = false;
            },

            // 保存项目
            async saveProject() {
                if (!this.editingProject.title.trim()) {
                    this.$message.warning('请输入项目标题');
                    return;
                }
                if (!this.editingProject.content.trim()) {
                    this.$message.warning('请输入故事内容');
                    return;
                }

                try {
                    const project = {
                        ...this.editingProject,
                        id: this.editingProject.id || Date.now(),
                        lastModified: new Date().toISOString()
                    };

                    // 更新或添加项目
                    const projects = JSON.parse(localStorage.getItem('projects') || '[]');
                    const index = projects.findIndex(p => p.id === project.id);
                    
                    if (index !== -1) {
                        projects[index] = project;
                    } else {
                        projects.push(project);
                    }

                    localStorage.setItem('projects', JSON.stringify(projects));
                    this.projects = projects;
                    
                    this.$message.success('项目保存成功');
                    this.projectDialogVisible = false;

                    // 如果是当前正在编辑的项目，更新状态
                    if (this.currentProject && this.currentProject.id === project.id) {
                        this.storyTitle = project.title;
                        this.storyContent = project.content;
                        this.scriptContent = project.script;
                        this.currentScenes = project.scenes;
                    }
                } catch (error) {
                    console.error('保存项目失败:', error);
                    this.$message.error('保存项目失败：' + error.message);
                }
            },

            // 删除项目
            deleteProject(project) {
                this.$confirm('确定要删除该项目吗？此操作不可恢复', '提示', {
                    confirmButtonText: '确定',
                    cancelButtonText: '取消',
                    type: 'warning'
                }).then(() => {
                    const projects = JSON.parse(localStorage.getItem('projects') || '[]');
                    const index = projects.findIndex(p => p.id === project.id);
                    if (index !== -1) {
                        projects.splice(index, 1);
                        localStorage.setItem('projects', JSON.stringify(projects));
                        this.projects = projects;
                        this.$message.success('项目删除成功');
                    }
                }).catch(() => {});
            },

            // 导出项目PPT
            async exportProjectPPT(project) {
                if (!project.script || !project.scenes || project.scenes.length === 0) {
                    this.$message.warning('该项目还未生成脚本，请先生成脚本');
                    return;
                }

                this.exportLoading = true;
                try {
                    const pptExporter = new PPTExporter();
                    const fileName = await pptExporter.exportPPT(project.title, project.scenes);
                    this.$message.success(`PPT导出成功：${fileName}`);
                } catch (error) {
                    console.error('PPT导出错误:', error);
                    this.$message.error('PPT导出失败：' + error.message);
                } finally {
                    this.exportLoading = false;
                }
            },

            // 加载项目列表
            loadProjects() {
                try {
                    const savedProjects = localStorage.getItem('projects');
                    if (savedProjects) {
                        this.projects = JSON.parse(savedProjects);
                        // 按最后修改时间排序
                        this.projects.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
                    }
                } catch (error) {
                    console.error('加载项目列表失败:', error);
                    this.$message.error('加载项��列表失败');
                }
            },

            // 编辑脚本
            editScript() {
                // TODO: 实现脚本编辑功能
                this.$message.info('脚本编辑功能正在开发中...');
            },

            // 导出PPT
            async exportToPPT() {
                if (!this.storyTitle || !this.currentScenes.length) {
                    this.$message.warning('请先生成脚本内容');
                    return;
                }

                this.exportLoading = true;
                try {
                    console.log('开始导出PPT...');
                    console.log('当前场景数据:', this.currentScenes);
                    
                    const pptExporter = new PPTExporter();
                    const fileName = await pptExporter.exportPPT(this.storyTitle, this.currentScenes);
                    
                    console.log('PPT导出成功:', fileName);
                    this.$message.success(`PPT导出成功：${fileName}`);
                } catch (error) {
                    console.error('PPT导出错误:', error);
                    this.$message.error('PPT导出失败：' + error.message);
                } finally {
                    this.exportLoading = false;
                }
            },

            // 获取项目状态类型
            getStatusType(project) {
                if (project.generating) return 'warning';
                return project.script ? 'success' : 'info';
            },

            // 为项目生成脚本
            async generateScriptForProject(project) {
                if (!project.content) {
                    this.$message.warning('项目内容为空，请先添加故事内容');
                    return;
                }

                if (project.generating) {
                    this.$message.warning('脚本正在生成中，请稍候...');
                    return;
                }

                if (!this.apiSettings.apiKey) {
                    this.$message.warning('请先配置API密钥');
                    this.showSettings();
                    return;
                }

                try {
                    // 更新项目状态
                    const projects = JSON.parse(localStorage.getItem('projects') || '[]');
                    const index = projects.findIndex(p => p.id === project.id);
                    if (index === -1) {
                        throw new Error('项目不存在');
                    }

                    // 设置生成状态
                    this.$set(project, 'generating', true);
                    projects[index] = { ...project, generating: true };
                    localStorage.setItem('projects', JSON.stringify(projects));

                    // 调用API生成脚本
                    console.log('开始为项目生成脚本:', project.title);
                    const response = await this.callDeepSeekAPI(project.content);
                    
                    // 更新项目数据
                    const scriptContent = this.formatScript(response);
                    const updatedProject = {
                        ...project,
                        script: scriptContent,
                        scenes: response.scenes,
                        generating: false,
                        lastModified: new Date().toISOString()
                    };

                    // 保存更新后的项目
                    projects[index] = updatedProject;
                    localStorage.setItem('projects', JSON.stringify(projects));
                    
                    // 更新视图
                    this.$set(this.projects, index, updatedProject);
                    
                    // 如果是当前编辑的项目，同步更新当前状态
                    if (this.currentProject && this.currentProject.id === project.id) {
                        this.currentProject = updatedProject;
                        this.storyTitle = updatedProject.title;
                        this.storyContent = updatedProject.content;
                        this.scriptContent = scriptContent;
                        this.currentScenes = response.scenes;
                    }

                    this.$message.success('脚本生成成功！');
                } catch (error) {
                    console.error('生成脚本错误:', error);
                    
                    // 恢复项目状态
                    const projects = JSON.parse(localStorage.getItem('projects') || '[]');
                    const index = projects.findIndex(p => p.id === project.id);
                    if (index !== -1) {
                        this.$set(project, 'generating', false);
                        projects[index] = { ...project, generating: false };
                        localStorage.setItem('projects', JSON.stringify(projects));
                    }

                    this.$message.error('生成脚本失败：' + error.message);
                }
            },

            // 修改原有的生成脚本方法
            async generateScriptForCurrentStory() {
                if (!this.storyTitle) {
                    this.$message.warning('请输入故事标题');
                    return;
                }
                if (!this.storyContent) {
                    this.$message.warning('请输入故事内容');
                    return;
                }

                if (!this.apiSettings.apiKey) {
                    this.$message.warning('请先配置API密钥');
                    this.showSettings();
                    return;
                }

                this.loading = true;
                try {
                    const response = await this.callDeepSeekAPI(this.storyContent);
                    this.scriptContent = this.formatScript(response);
                    this.currentScenes = response.scenes;

                    // 保存到当前项目
                    if (this.currentProject) {
                        const projects = JSON.parse(localStorage.getItem('projects') || '[]');
                        const index = projects.findIndex(p => p.id === this.currentProject.id);
                        if (index !== -1) {
                            const updatedProject = {
                                ...projects[index],
                                title: this.storyTitle,
                                content: this.storyContent,
                                script: this.scriptContent,
                                scenes: this.currentScenes,
                                lastModified: new Date().toISOString()
                            };
                            projects[index] = updatedProject;
                            localStorage.setItem('projects', JSON.stringify(projects));
                            this.projects = projects;
                            this.currentProject = updatedProject;
                        }
                    }

                    this.$message.success('脚本生成成功！');
                } catch (error) {
                    console.error('生成脚本错误:', error);
                    this.$message.error(error.message);
                } finally {
                    this.loading = false;
                }
            },

            // 获取表格行的类名
            tableRowClassName({ row, rowIndex }) {
                if (row.generating) {
                    return 'generating-row';
                }
                return row.script ? 'completed-row' : 'draft-row';
            }
        },
        mounted() {
            // 添加窗口大小变化监听
            window.addEventListener('resize', this.handleResize);
            this.handleResize();

            // 检查字体加载状态
            document.fonts.ready.then(() => {
                console.log('所有字体已加载完成');
            }).catch(error => {
                console.warn('字体加载出现问题:', error);
            });

            // 原有的mounted逻辑
            const savedProjects = localStorage.getItem('projects');
            if (savedProjects) {
                this.projects = JSON.parse(savedProjects);
            }

            // 加载保存的设置
            const savedTemperature = localStorage.getItem('deepseek_temperature');
            const savedMaxTokens = localStorage.getItem('deepseek_max_tokens');
            
            if (savedTemperature) {
                this.apiSettings.temperature = parseFloat(savedTemperature);
            }
            if (savedMaxTokens) {
                this.apiSettings.maxTokens = parseInt(savedMaxTokens);
            }

            // 检查API密钥
            if (!this.apiSettings.apiKey) {
                this.$message.warning('请配置DeepSeek API密钥');
                this.showSettings();
            }

            this.loadProjects(); // 加载项目列表

            // 初始化项目生成状态
            this.projects.forEach(project => {
                if (project.generating) {
                    this.$set(project, 'generating', false);
                }
            });
        },
        beforeDestroy() {
            // 移除窗口大小变化监听
            window.removeEventListener('resize', this.handleResize);
        }
    });
}).catch(error => {
    console.error('资源加载错误:', error);
    alert('页面资源加载失败，请刷新页面重试：' + error.message);
}); 