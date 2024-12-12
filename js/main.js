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

// 添加防抖处理
const debounce = (fn, delay) => {
    let timer = null;
    return function(...args) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
};

// 创建Vue实例前检查资源
checkResourceLoading().then(() => {
    // 创建Vue实例
    new Vue({
        el: '#app',
        data() {
            return {
                storyTitle: '',
                storyContent: '',
                scriptContent: null,
                activeIndex: '1',
                loading: false,
                exportLoading: false,
                projects: [],
                currentProject: null,
                editingProject: {
                    id: null,
                    title: '',
                    content: '',
                    script: null,
                    scenes: [],
                    lastModified: null
                },
                projectDialogVisible: false,
                
                // 添加脚本编辑相关数据
                scriptEditDialogVisible: false,
                editingScript: '',
                showFindReplace: false,
                findText: '',
                replaceText: '',
                editorHistory: [],
                currentHistoryIndex: -1,
                editorFontSize: 15,
                
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
            };
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
                // 加密API密钥
                const encryptedKey = btoa(this.apiSettings.apiKey);
                localStorage.setItem('deepseek_api_key', encryptedKey);
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
                this.$loading({
                    lock: true,
                    text: '正在生成脚本...',
                    spinner: 'el-icon-loading',
                    background: 'rgba(0, 0, 0, 0.7)'
                });
                try {
                    await this.callDeepSeekAPI(this.storyContent);
                } finally {
                    this.$loading().close();
                }
            },

            // 调用DeepSeek API
            async callDeepSeekAPI(content) {
                // 增加超时时间到60秒，并修改超时处理逻辑
                const controller = new AbortController();
                let timeoutId;
                
                try {
                    const timeoutPromise = new Promise((_, reject) => {
                        timeoutId = setTimeout(() => {
                            controller.abort();
                            reject(new Error('请求超时，请检查网络连接或稍后重试'));
                        }, 60000);
                    });

                    const fetchPromise = fetch(config.DEEPSEEK_API_URL, {
                        signal: controller.signal,
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.apiSettings.apiKey}`,
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify({
                            ...config.MODEL_PARAMS,
                            messages: [
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
                            ],
                            stream: false
                        })
                    });

                    // 使用 Promise.race 来处理超时
                    const response = await Promise.race([fetchPromise, timeoutPromise]);

                    if (!response.ok) {
                        let errorMessage = `API请求失败: ${response.status}`;
                        try {
                            const errorData = await response.json();
                            if (response.status === 401) {
                                errorMessage = 'API密钥无效或已过期，请检查API密钥设置';
                                localStorage.removeItem('deepseek_api_key');
                                this.apiSettings.apiKey = '';
                                this.showSettings();
                            } else {
                                errorMessage = errorData.error?.message || errorMessage;
                            }
                        } catch (e) {
                            console.error('解析错误响应失败:', e);
                        }
                        throw new Error(errorMessage);
                    }

                    const data = await response.json();
                    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                        throw new Error('API响应格式不正确');
                    }

                    return this.parseAPIResponse(data);
                } catch (error) {
                    if (error.name === 'AbortError' || error.message.includes('超时')) {
                        throw new Error('请求超时，请检查网络连接或稍后重试');
                    }
                    if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                        throw new Error('无法连接到API服务器，请检查：\n1. API密钥是否正确\n2. 网络连接是否正常\n3. API服务是否可用');
                    }
                    throw error;
                } finally {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                }
            },

            // 解析API响应
            parseAPIResponse(data) {
                try {
                    // 直接返回模型的原始输出文本
                    const content = data.choices[0].message.content;
                    console.log('API返回内容:', content);
                    this.scriptContent = content;
                    return { content, scriptContent: content };
                } catch (error) {
                    console.error('API响应处理错误:', error);
                    throw new Error('无法处理API响应：' + error.message);
                }
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
                    lastModified: null
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
                    this.$message.error('加载项目列表失败');
                }
            },

            // 编辑脚本
            editScript() {
                this.editingScript = this.scriptContent;
                this.editorHistory = [this.scriptContent];
                this.currentHistoryIndex = 0;
                this.showFindReplace = false;
                this.findText = '';
                this.replaceText = '';
                this.scriptEditDialogVisible = true;

                // 设置初始字体大小
                this.$nextTick(() => {
                    const textarea = this.$refs.scriptEditor.$refs.textarea;
                    if (textarea) {
                        textarea.style.fontSize = `${this.editorFontSize}px`;
                    }
                });
            },

            // 保存脚本编辑
            async saveScriptEdit() {
                if (!this.editingScript.trim()) {
                    this.$message.warning('脚本内容不能为空');
                    return;
                }

                try {
                    // 解析脚本内容
                    const scenes = this.parseScriptContent(this.editingScript);
                    
                    // 更新脚本内容和场景数据
                    this.scriptContent = this.editingScript;
                    this.currentScenes = scenes;

                    // 如果是当前项目，更新项目数据
                    if (this.currentProject) {
                        const projects = JSON.parse(localStorage.getItem('projects') || '[]');
                        const index = projects.findIndex(p => p.id === this.currentProject.id);
                        if (index !== -1) {
                            const updatedProject = {
                                ...projects[index],
                                script: this.editingScript,
                                scenes: scenes,
                                lastModified: new Date().toISOString()
                            };
                            projects[index] = updatedProject;
                            localStorage.setItem('projects', JSON.stringify(projects));
                            this.projects = projects;
                            this.currentProject = updatedProject;
                        }
                    }

                    this.scriptEditDialogVisible = false;
                    this.$message.success('脚本保存成功');
                } catch (error) {
                    console.error('保存脚本错误:', error);
                    this.$message.error('保存脚本失败：' + error.message);
                }
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
                    
                    // 保存到当前项目
                    if (this.currentProject) {
                        const projects = JSON.parse(localStorage.getItem('projects') || '[]');
                        const index = projects.findIndex(p => p.id === this.currentProject.id);
                        if (index !== -1) {
                            const updatedProject = {
                                ...projects[index],
                                title: this.storyTitle,
                                content: this.storyContent,
                                script: response.scriptContent,
                                scenes: response.scenes,
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
            },

            // 建议添加数据导出备份功能
            exportProjectData() {
                const projects = JSON.parse(localStorage.getItem('projects') || '[]');
                const dataStr = JSON.stringify(projects, null, 2);
                const blob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.href = url;
                a.download = `故事脚本项目备份_${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
            },

            // 对输入事件添加防抖
            handleStoryInput: debounce(function(value) {
                this.storyContent = value;
                this.saveProject();
            }, 500),

            // 添加输入数据验证
            validateProjectData(project) {
                if (!project.title || typeof project.title !== 'string') {
                    throw new Error('项目标题无效');
                }
                if (!project.content || typeof project.content !== 'string') {
                    throw new Error('故事内容无效');
                }
                // ... 其他验证
            },

            // 编辑器相关方法
            handleUndo() {
                if (this.currentHistoryIndex > 0) {
                    this.currentHistoryIndex--;
                    this.editingScript = this.editorHistory[this.currentHistoryIndex];
                }
            },

            handleRedo() {
                if (this.currentHistoryIndex < this.editorHistory.length - 1) {
                    this.currentHistoryIndex++;
                    this.editingScript = this.editorHistory[this.currentHistoryIndex];
                }
            },

            // 监听编辑器内容变化
            handleEditorChange(value) {
                // 添加到历史记录
                if (this.currentHistoryIndex < this.editorHistory.length - 1) {
                    this.editorHistory = this.editorHistory.slice(0, this.currentHistoryIndex + 1);
                }
                this.editorHistory.push(value);
                this.currentHistoryIndex = this.editorHistory.length - 1;
            },

            // 切换查找替换面板
            toggleFindReplace() {
                this.showFindReplace = !this.showFindReplace;
                if (this.showFindReplace) {
                    this.$nextTick(() => {
                        const selection = window.getSelection().toString();
                        if (selection) {
                            this.findText = selection;
                        }
                    });
                }
            },

            // 查找下一个
            findNext() {
                if (!this.findText) {
                    this.$message.warning('请输入要查找的内容');
                    return;
                }

                const text = this.editingScript;
                const searchText = this.findText;
                const textarea = this.$refs.scriptEditor.$refs.textarea;
                const startPos = textarea.selectionEnd;
                
                const index = text.indexOf(searchText, startPos);
                if (index !== -1) {
                    textarea.focus();
                    textarea.setSelectionRange(index, index + searchText.length);
                } else {
                    // 从头开始查找
                    const firstIndex = text.indexOf(searchText);
                    if (firstIndex !== -1) {
                        textarea.focus();
                        textarea.setSelectionRange(firstIndex, firstIndex + searchText.length);
                    } else {
                        this.$message.warning('未找到匹配内容');
                    }
                }
            },

            // 替换当前
            replace() {
                if (!this.findText) {
                    this.$message.warning('请输入要查找的内容');
                    return;
                }

                const textarea = this.$refs.scriptEditor.$refs.textarea;
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const selectedText = this.editingScript.substring(start, end);

                if (selectedText === this.findText) {
                    const newText = this.editingScript.substring(0, start) + 
                                  this.replaceText + 
                                  this.editingScript.substring(end);
                    this.editingScript = newText;
                    this.handleEditorChange(newText);
                    
                    // 移动光标到替换文本之后
                    this.$nextTick(() => {
                        const newPos = start + this.replaceText.length;
                        textarea.setSelectionRange(newPos, newPos);
                    });
                }
                
                // 继续查找下一个
                this.findNext();
            },

            // 替换全部
            replaceAll() {
                if (!this.findText) {
                    this.$message.warning('请输入要查找的内容');
                    return;
                }

                const newText = this.editingScript.split(this.findText).join(this.replaceText);
                if (newText === this.editingScript) {
                    this.$message.warning('未找到匹配内容');
                    return;
                }

                this.editingScript = newText;
                this.handleEditorChange(newText);
                this.$message.success('替换完成');
            },

            // 格式化脚本
            formatScript() {
                try {
                    // 分段处理
                    const paragraphs = this.editingScript.split('\n\n').filter(p => p.trim());
                    
                    // 格式化每段落
                    const formattedParagraphs = paragraphs.map(paragraph => {
                        // 处理场景标题
                        if (paragraph.trim().startsWith('场景')) {
                            return `\n${paragraph.trim()}\n${'-'.repeat(30)}`;
                        }
                        return paragraph.trim();
                    });

                    const formattedText = formattedParagraphs.join('\n\n');
                    this.editingScript = formattedText;
                    this.handleEditorChange(formattedText);
                    this.$message.success('格式化完成');
                } catch (error) {
                    console.error('格式化错误:', error);
                    this.$message.error('格式化失败：' + error.message);
                }
            },

            // 调整字体大小
            handleFontSize(size) {
                this.editorFontSize = parseInt(size);
                const textarea = this.$refs.scriptEditor.$refs.textarea;
                if (textarea) {
                    textarea.style.fontSize = `${size}px`;
                }
            },

            // 解析脚本内容为场景数组
            parseScriptContent(content) {
                try {
                    const scenes = [];
                    const sceneTexts = content.split(/场景\s*\d+/).filter(text => text.trim());
                    
                    sceneTexts.forEach((text, index) => {
                        const scene = {
                            sceneNumber: index + 1,
                            description: '',
                            dialogue: '',
                            action: '',
                            cameraShot: '',
                            duration: '',
                            bgm: ''
                        };

                        // 解析各个字段
                        const lines = text.trim().split('\n');
                        let currentField = '';
                        let currentContent = [];

                        lines.forEach(line => {
                            line = line.trim();
                            if (!line || line === '---') return;

                            // 检查是否是字段标题
                            if (line.includes('：')) {
                                // 保存之前收集的内容
                                if (currentField && currentContent.length > 0) {
                                    scene[currentField] = currentContent.join('\n').trim();
                                    currentContent = [];
                                }

                                const [key, ...valueParts] = line.split('：');
                                const value = valueParts.join('：').trim();
                                
                                // 字段映射
                                const fieldMap = {
                                    '场景描述': 'description',
                                    '对白': 'dialogue',
                                    '动作指示': 'action',
                                    '镜头建议': 'cameraShot',
                                    '时长': 'duration',
                                    '背景音乐': 'bgm'
                                };

                                currentField = fieldMap[key.trim()];
                                if (currentField && value) {
                                    currentContent.push(value);
                                }
                            } else if (currentField) {
                                currentContent.push(line);
                            }
                        });

                        // 保存最后一个字段的内容
                        if (currentField && currentContent.length > 0) {
                            scene[currentField] = currentContent.join('\n').trim();
                        }

                        scenes.push(scene);
                    });

                    return scenes;
                } catch (error) {
                    console.error('解析脚本内容错误:', error);
                    throw new Error('解析脚本失败：' + error.message);
                }
            },

            // 补充脚本字段
            async enhanceScript(content) {
                try {
                    console.log('准备发送到AI的原始内容:', content);

                    const prompt = `作为专业的视频脚本编剧，请帮我补充和完善以下视频脚本。

===== 原始脚本开始 =====
${content}
===== 原始脚本结束 =====

请分析上述脚本，并按照以下要求补充完善：

1. 保持原有的场景编号和基本结构
2. 检查并补充每个场景的以下字段：
   - 场景描述：详细描述场景的环境、时间、氛围
   - 对白：角色对话内容，如无对话则写"无对白"
   - 动作指示：人物的动作、表情、肢体语言
   - 镜头建议：具体的镜头角度、运动方式
   - 时长：预估的场景时长（秒数）
   - 背景音乐：具体的音乐风格或情绪

3. 输出要求：
   - 保持"字段名：内容"的格式
   - 场景之间使用"---"分隔
   - 直接输出完整脚本，不要添加任何解释
   - 确保每个场景的所有字段都完整

请直接返回完整的脚本内容。`;

                    console.log('发送到AI的提示词:', prompt);

                    const response = await fetch(config.DEEPSEEK_API_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.apiSettings.apiKey}`
                        },
                        body: JSON.stringify({
                            model: config.MODEL_PARAMS.model,
                            messages: [
                                {
                                    role: 'system',
                                    content: '你是一个专业的视频脚本编剧，擅长编写和完善视频脚本。请直接返回补充完善后的完整脚本，不要添加任何解释或说明。'
                                },
                                {
                                    role: 'user',
                                    content: prompt
                                }
                            ],
                            temperature: 0.7,
                            max_tokens: 4000,
                            top_p: 0.95,
                            frequency_penalty: 0.1,
                            presence_penalty: 0.1
                        })
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        throw new Error(errorData.error?.message || `API请求失败: ${response.status}`);
                    }

                    const data = await response.json();
                    if (!data.choices?.[0]?.message?.content) {
                        throw new Error('API响应格式不正确');
                    }

                    const enhancedContent = data.choices[0].message.content.trim();
                    console.log('AI返回的增强内容:', enhancedContent);

                    return enhancedContent;
                } catch (error) {
                    console.error('补充脚本字段错误:', error);
                    throw new Error('补充脚本字段失败：' + error.message);
                }
            },

            // 显示AI建议对话框
            async showAISuggestionDialog(originalContent, enhancedContent) {
                try {
                    // 格式化内容显示
                    const formatContent = (content) => {
                        return content.split('\n').map(line => {
                            // 处理场景标题
                            if (line.trim().startsWith('场景')) {
                                return `<div class="scene-title">${line}</div>`;
                            }
                            // 处理字段标题
                            if (line.includes('：')) {
                                const [key, ...values] = line.split('：');
                                return `<div class="field-line">
                                    <span class="field-name">${key}：</span>
                                    <span class="field-value">${values.join('：')}</span>
                                </div>`;
                            }
                            // 处理分隔符
                            if (line.trim() === '---') {
                                return '<div class="scene-separator">---</div>';
                            }
                            // 普通行
                            return `<div class="content-line">${line}</div>`;
                        }).join('');
                    };

                    const result = await this.$confirm(
                        `<div class="ai-suggestion-dialog">
                            <div class="suggestion-header">
                                <p>AI已补充完善脚本内容，请查看并确认修改：</p>
                            </div>
                            <div class="suggestion-content">
                                <div class="content-comparison">
                                    <div class="content-section original">
                                        <div class="section-header">原始内容</div>
                                        <div class="section-body">
                                            ${formatContent(originalContent)}
                                        </div>
                                    </div>
                                    <div class="content-section enhanced">
                                        <div class="section-header">补充后内容</div>
                                        <div class="section-body">
                                            ${formatContent(enhancedContent)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>`,
                        '确认AI补充内容',
                        {
                            confirmButtonText: '应用修改',
                            cancelButtonText: '保持原样',
                            dangerouslyUseHTMLString: true,
                            closeOnClickModal: false,
                            closeOnPressEscape: false,
                            showClose: false,
                            customClass: 'ai-suggestion-dialog'
                        }
                    ).catch(() => false);

                    return result === true ? enhancedContent : originalContent;
                } catch (error) {
                    console.error('显示AI建议对话框错误:', error);
                    throw error;
                }
            },

            // 分析脚本内容
            async analyzeScript(content) {
                try {
                    console.log('开始分析脚本内容');
                    const prompt = `作为专业的视频脚本分析师，请分析以下脚本内容，并提供改进建议：

===== 脚本内容开始 =====
${content}
===== 脚本内容结束 =====

请按以下方面进行分析：

1. 场景完整性分析：
   - 检查每个场景的必要元素是否完整
   - 指出缺失的关键信息
   - 建议补充的内容

2. 视觉效果分析：
   - 评估场景描述的具体程度
   - 检查镜头建议的专业性
   - 建议更好的视觉表现方式

3. 叙事流畅性分析：
   - 评估场景转换的自然度
   - 检查情节发展的连贯性
   - 建议优化的部分

请提供具体的改进建议，以便生成更好的PPT展示效果。`;

                    const response = await fetch(config.DEEPSEEK_API_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.apiSettings.apiKey}`
                        },
                        body: JSON.stringify({
                            model: config.MODEL_PARAMS.model,
                            messages: [
                                {
                                    role: 'system',
                                    content: '你是一个专业的视频脚本分析师，擅长分析和优化视频脚本。'
                                },
                                {
                                    role: 'user',
                                    content: prompt
                                }
                            ],
                            temperature: 0.7,
                            max_tokens: 4000
                        })
                    });

                    if (!response.ok) {
                        throw new Error('API请求失败: ' + response.status);
                    }

                    const data = await response.json();
                    return data.choices[0].message.content;
                } catch (error) {
                    console.error('分析脚本内容错误:', error);
                    throw new Error('分析脚本失败：' + error.message);
                }
            },

            // 显示分析结果对话框
            async showAnalysisDialog(analysis, originalContent) {
                try {
                    const result = await this.$confirm(
                        `<div class="script-analysis-dialog">
                            <div class="analysis-header">
                                <p>AI已完成脚本分析，请查看分析结果：</p>
                            </div>
                            <div class="analysis-content">
                                <div class="analysis-section">
                                    <pre>${analysis}</pre>
                                </div>
                            </div>
                            <div class="analysis-footer">
                                <p>是否需要AI根据分析结果补充完善脚本？</p>
                            </div>
                        </div>`,
                        '脚本分析结果',
                        {
                            confirmButtonText: '补充完善',
                            cancelButtonText: '保持原样',
                            dangerouslyUseHTMLString: true,
                            closeOnClickModal: false,
                            closeOnPressEscape: false,
                            customClass: 'script-analysis-dialog'
                        }
                    ).catch(() => false);

                    return result;
                } catch (error) {
                    console.error('显示分析结果错误:', error);
                    throw error;
                }
            },

            // 生成PPT结构数据
            async generatePPTStructure(content) {
                try {
                    console.log('开始生成PPT结构数据');
                    const prompt = `分析以下脚本内容并生成完整的PPT结构数据：

${content}

请生成包含以下有必内容的JSON数据（确保完整性）：
{
    "title": "视频脚本PPT",
    "slides": [
        {
            "type": "cover",
            "content": {
                "title": "主标题",
                "subtitle": "副标题",
                "description": "描述文本"
            },
            "style": {
                "theme": "主题颜色"
            }
        },
        {
            "type": "overview",
            "content": {
                "title": "内容概述",
                "items": [
                    "总体介绍",
                    "场景列表",
                    "关键要点"
                ]
            }
        },
        {
            "type": "scene",
            "sceneNumber": "场景编号",
            "content": {
                "title": "场景标题",
                "description": "场景描述",
                "shots": [
                    "镜头1描述",
                    "镜头2描述"
                ],
                "dialogues": [
                    "对白1",
                    "对白2"
                ],
                "visualEffects": [
                    "视觉效果1",
                    "视觉效果2"
                ],
                "duration": "场景时长",
                "bgm": "背景音乐"
            },
            "style": {
                "layout": "布局类型"
            }
        }
    ],
    "theme": {
        "primary": "#409EFF",
        "secondary": "#666666",
        "background": "#FFFFFF",
        "text": "#333333"
    }
}

注意：
1. 为每个场景生成完整的场景信息
2. 确保包含所有必要的视觉效果和镜头信息
3. 添加合适的时长和背景音乐建议
4. 保持数据结构的完整性`;

                    const response = await fetch(config.DEEPSEEK_API_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.apiSettings.apiKey}`
                        },
                        body: JSON.stringify({
                            model: config.MODEL_PARAMS.model,
                            messages: [
                                {
                                    role: 'system',
                                    content: '你是一个专业的视频脚本分析和PPT结构设计专家。请确保生成完整的PPT结构数据，包含所有必要的场景信息、视觉效果和细节。'
                                },
                                {
                                    role: 'user',
                                    content: prompt
                                }
                            ],
                            temperature: 0.7,
                            max_tokens: 4000
                        })
                    });

                    if (!response.ok) {
                        throw new Error('API请求失败: ' + response.status);
                    }

                    const data = await response.json();
                    console.log('API原始返回数据:', data.choices[0].message.content);
                    
                    // 清理和解析返回的数据
                    let jsonStr = data.choices[0].message.content;
                    
                    // 移除所有可能的markdown标记和多余的空白
                    jsonStr = jsonStr
                        .replace(/```json\s*/g, '')
                        .replace(/```\s*/g, '')
                        .replace(/^\s+|\s+$/g, '');
                    
                    // 确保字符串以 { 开始，以 } 结束
                    jsonStr = jsonStr.trim();
                    const firstBrace = jsonStr.indexOf('{');
                    const lastBrace = jsonStr.lastIndexOf('}');
                    
                    if (firstBrace === -1 || lastBrace === -1) {
                        throw new Error('返回的数据不是有效的JSON格式');
                    }
                    
                    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
                    
                    console.log('清理后的JSON字符串:', jsonStr);
                    
                    try {
                        const pptStructure = JSON.parse(jsonStr);
                        console.log('解析后的PPT结构数据:', pptStructure);
                        
                        // 验证数据结构的完整性
                        if (!this.validatePPTStructure(pptStructure)) {
                            throw new Error('PPT结构数据不完整');
                        }
                        
                        return pptStructure;
                    } catch (parseError) {
                        console.error('JSON解析错误:', parseError);
                        console.error('尝试解析的字符��:', jsonStr);
                        throw new Error('PPT结构数据解析失败：' + parseError.message);
                    }
                } catch (error) {
                    console.error('生成PPT结构数据错误:', error);
                    this.$message.error('生成PPT结构失败：' + error.message);
                    throw error;
                }
            },

            // 验证PPT结构数据的完整性
            validatePPTStructure(structure) {
                if (!structure.title || !Array.isArray(structure.slides) || structure.slides.length === 0) {
                    return false;
                }

                // 验证必需的幻灯片类型是否存在
                const hasRequiredSlides = structure.slides.some(slide => slide.type === 'cover') &&
                    structure.slides.some(slide => slide.type === 'overview');

                if (!hasRequiredSlides) {
                    return false;
                }

                // 验证每个场景幻灯片的完整性
                const sceneSlides = structure.slides.filter(slide => slide.type === 'scene');
                if (sceneSlides.length === 0) {
                    return false;
                }

                for (const slide of sceneSlides) {
                    if (!this.validateSceneSlide(slide)) {
                        return false;
                    }
                }

                return true;
            },

            // 验证场景幻灯片的完整性
            validateSceneSlide(slide) {
                const { content } = slide;
                if (!content) return false;

                // 检查必需的场景信息
                const requiredFields = ['title', 'description', 'shots', 'dialogues'];
                for (const field of requiredFields) {
                    if (!content[field]) return false;
                }

                // 检查数组类型的字段
                const arrayFields = ['shots', 'dialogues', 'visualEffects'];
                for (const field of arrayFields) {
                    if (content[field] && !Array.isArray(content[field])) return false;
                }

                return true;
            },

            // 生成PPT预览
            async generatePPTPreview() {
                if (!this.editingScript) {
                    this.$message.warning('请先编辑脚本内容');
                    return;
                }

                try {
                    // 显示分析加载提示
                    const loading = this.$loading({
                        lock: true,
                        text: '正在分析脚本内容...',
                        spinner: 'el-icon-loading',
                        background: 'rgba(0, 0, 0, 0.7)'
                    });

                    try {
                        // 先生成PPT结构数据
                        const pptStructure = await this.generatePPTStructure(this.editingScript);
                        loading.close();

                        // 显示结构预览并确认
                        const confirmResult = await this.$confirm(
                            `<div class="ppt-structure-preview">
                                <div class="preview-header">
                                    <p>AI已生成PPT结构方案，请查看并确认：</p>
                                </div>
                                <div class="preview-content">
                                    <pre>${JSON.stringify(pptStructure, null, 2)}</pre>
                                </div>
                            </div>`,
                            'PPT结构预览',
                            {
                                confirmButtonText: '生成PPT',
                                cancelButtonText: '取消',
                                dangerouslyUseHTMLString: true,
                                customClass: 'ppt-structure-dialog'
                            }
                        ).catch(() => false);

                        if (confirmResult) {
                            // 使用结构数据生成PPT
                            const pptExporter = new PPTExporter();
                            await pptExporter.generateFromStructure(pptStructure);
                            this.$message.success('PPT预览生成成功');
                        }
                    } catch (error) {
                        loading.close();
                        this.$message.error(error.message);
                        return;
                    }
                } catch (error) {
                    console.error('生成PPT预览错误:', error);
                    this.$message.error(error.message);
                }
            },

            // 检查脚本字段完整性
            checkScriptCompleteness(scenes) {
                const requiredFields = ['description', 'dialogue', 'action', 'cameraShot', 'duration', 'bgm'];
                const missingFields = new Set();
                const incompleteScenes = [];
                
                scenes.forEach((scene, index) => {
                    const sceneMissingFields = [];
                    requiredFields.forEach(field => {
                        if (!scene[field] || scene[field].trim() === '') {
                            missingFields.add(field);
                            sceneMissingFields.push(field);
                        }
                    });
                    
                    if (sceneMissingFields.length > 0) {
                        incompleteScenes.push({
                            sceneNumber: index + 1,
                            missingFields: sceneMissingFields
                        });
                    }
                });

                return {
                    isComplete: missingFields.size === 0,
                    missingFields: Array.from(missingFields),
                    incompleteScenes: incompleteScenes
                };
            },

            // 添加工具栏按钮
            addToolbarButtons() {
                const toolbar = document.createElement('div');
                toolbar.className = 'editor-toolbar';
                toolbar.innerHTML = `
                    <div class="toolbar-group">
                        <button class="toolbar-btn" title="保存">
                            <i class="el-icon-document-checked"></i>
                            保存
                        </button>
                        <button class="toolbar-btn" title="取消">
                            <i class="el-icon-close"></i>
                            取消
                        </button>
                    </div>
                    <div class="toolbar-group">
                        <button class="toolbar-btn preview-btn" title="预览PPT">
                            <i class="el-icon-view"></i>
                            预览PPT
                        </button>
                    </div>
                `;

                // 绑定事件
                const saveBtn = toolbar.querySelector('.toolbar-btn[title="保存"]');
                const cancelBtn = toolbar.querySelector('.toolbar-btn[title="取消"]');
                const previewBtn = toolbar.querySelector('.preview-btn');

                if (saveBtn) {
                    saveBtn.addEventListener('click', () => this.saveScript());
                }
                if (cancelBtn) {
                    cancelBtn.addEventListener('click', () => this.cancelEdit());
                }
                if (previewBtn) {
                    previewBtn.addEventListener('click', () => this.generatePPTPreview());
                }
                
                // 添加样式
                const style = document.createElement('style');
                style.textContent = `
                    .editor-toolbar {
                        display: flex;
                        justify-content: space-between;
                        padding: 8px;
                        background: #f5f7fa;
                        border-bottom: 1px solid #e4e7ed;
                    }
                    .toolbar-group {
                        display: flex;
                        gap: 8px;
                    }
                    .toolbar-btn {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        padding: 6px 12px;
                        border: 1px solid #dcdfe6;
                        border-radius: 4px;
                        background: white;
                        color: #606266;
                        cursor: pointer;
                        transition: all 0.3s;
                    }
                    .toolbar-btn:hover {
                        background: #ecf5ff;
                        border-color: #409eff;
                        color: #409eff;
                    }
                    .preview-btn {
                        background: #409eff;
                        color: white;
                        border-color: #409eff;
                        font-weight: 500;
                    }
                    .preview-btn:hover {
                        background: #66b1ff;
                        border-color: #66b1ff;
                        color: white;
                    }
                    .preview-btn i {
                        font-size: 16px;
                    }
                `;
                document.head.appendChild(style);
                
                return toolbar;
            },
        },
        watch: {
            // 监听编辑器内容变化
            editingScript: {
                handler(newValue) {
                    this.handleEditorChange(newValue);
                }
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

            // 加载并解密API密钥
            const encryptedKey = localStorage.getItem('deepseek_api_key');
            if (encryptedKey) {
                try {
                    this.apiSettings.apiKey = atob(encryptedKey);
                } catch (error) {
                    console.error('解密API密钥失败:', error);
                    this.apiSettings.apiKey = '';
                }
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

            // 首次访问显示功能引导
            if (!localStorage.getItem('hasShownGuide')) {
                this.$notify({
                    title: '使用提示',
                    message: '点击"新建项目"开始创作您的故事',
                    duration: 0,
                    type: 'info'
                });
                localStorage.setItem('hasShownGuide', 'true');
            }

            // 添加工具栏
            const editorContainer = document.querySelector('.monaco-editor-container');
            if (editorContainer) {
                const toolbar = this.addToolbarButtons();
                editorContainer.insertBefore(toolbar, editorContainer.firstChild);
            }

            // 检查是否需要显示引导
            if (!localStorage.getItem('hasShownGuide')) {
                this.showGuide();
                localStorage.setItem('hasShownGuide', 'true');
            }
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