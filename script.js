// 视频压缩函数（使用Canvas和MediaRecorder，支持高质量压缩）
async function compressVideo(file, maxWidth = 1920, maxHeight = 1080, bitrate = 6000000, onProgress = null, fps = 30) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        video.preload = 'metadata'; // 只预加载元数据，加快加载速度
        video.muted = true; // 静音，减少音频处理开销
        video.playsInline = true;
        
        let mediaRecorder = null;
        const chunks = [];
        let animationFrameId = null;
        let startTime = null;
        let lastProgressTime = 0;
        let loadTimeout = null;
        let audioContext = null;
        
        // 设置加载超时（45秒，增加时间以处理大视频）
        loadTimeout = setTimeout(() => {
            if (!video.videoWidth || !video.videoHeight) {
                console.error('视频加载超时');
                reject(new Error('视频加载超时，请检查文件是否损坏'));
            }
        }, 45000);
        
        video.onloadedmetadata = function() {
            if (loadTimeout) {
                clearTimeout(loadTimeout);
                loadTimeout = null;
            }
            startTime = Date.now();
            const totalDuration = video.duration || 0;
            console.log(`视频元数据加载完成: ${video.videoWidth}x${video.videoHeight}, 时长: ${totalDuration}秒`);
            try {
                // 计算新尺寸（保持宽高比，尽量保持原始分辨率）
                let width = video.videoWidth;
                let height = video.videoHeight;
                const aspectRatio = width / height;
                const originalWidth = width;
                const originalHeight = height;
                
                // 只有在原始分辨率明显超过限制时才缩放（保持高画质）
                if (width > maxWidth || height > maxHeight) {
                    if (width > height) {
                        width = Math.min(width, maxWidth);
                        height = width / aspectRatio;
                    } else {
                        height = Math.min(height, maxHeight);
                        width = height * aspectRatio;
                    }
                    console.log(`分辨率缩放: ${originalWidth}x${originalHeight} -> ${width}x${height}`);
                } else {
                    // 保持原始分辨率
                    console.log(`保持原始分辨率: ${width}x${height}`);
                }
                
                // 确保尺寸为偶数（某些编码器要求）
                width = Math.floor(width / 2) * 2;
                height = Math.floor(height / 2) * 2;
                
                canvas.width = width;
                canvas.height = height;
                
                // 创建MediaRecorder（使用适中的帧率）
                const canvasStream = canvas.captureStream(fps);
                
                // 简化音频处理，只在必要时添加音频
                let audioTracks = [];
                try {
                    // 尝试创建音频上下文来捕获视频的音频
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    const source = audioContext.createMediaElementSource(video);
                    const destination = audioContext.createMediaStreamDestination();
                    source.connect(destination);
                    audioTracks = destination.stream.getAudioTracks();
                } catch (audioError) {
                    console.warn('音频处理失败，将只处理视频:', audioError);
                    // 继续执行，只处理视频
                }
                
                // 合并视频和音频流
                const videoTrack = canvasStream.getVideoTracks()[0];
                const combinedStream = new MediaStream();
                combinedStream.addTrack(videoTrack);
                audioTracks.forEach(track => combinedStream.addTrack(track));
                
                // 优先使用vp9编码（更好的压缩比和画质）
                let mimeType = 'video/webm;codecs=vp9';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'video/webm;codecs=vp8';
                    if (!MediaRecorder.isTypeSupported(mimeType)) {
                        mimeType = 'video/webm';
                    }
                }
                
                console.log(`使用编码格式: ${mimeType}, 分辨率: ${width}x${height}, 比特率: ${(bitrate / 1000000).toFixed(1)}Mbps, 帧率: ${fps}fps, 包含音频: ${audioTracks.length > 0}`);
                
                // 配置MediaRecorder选项（高质量，包含音频）
                const options = {
                    mimeType: mimeType,
                    videoBitsPerSecond: bitrate,
                    audioBitsPerSecond: 128000 // 降低音频比特率，减少处理开销
                };
                
                mediaRecorder = new MediaRecorder(combinedStream, options);
                
                mediaRecorder.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) {
                        chunks.push(e.data);
                    }
                };
                
                mediaRecorder.onstop = () => {
                    // 更新进度到100%
                    if (onProgress) {
                        onProgress(100);
                    }
                    
                    // 清理视频元素的事件监听器（防止错误触发）
                    video.onerror = null;
                    video.onloadedmetadata = null;
                    video.onended = null;
                    
                    // 清理音频上下文
                    if (audioContext && audioContext.state !== 'closed') {
                        audioContext.close().catch(err => console.warn('关闭音频上下文失败:', err));
                    }
                    
                    // 清理
                    if (animationFrameId) {
                        cancelAnimationFrame(animationFrameId);
                    }
                    video.pause();
                    const videoSrc = video.src;
                    video.src = '';
                    if (videoSrc && videoSrc.startsWith('blob:')) {
                        URL.revokeObjectURL(videoSrc);
                    }
                    
                    if (chunks.length === 0) {
                        reject(new Error('录制失败，没有数据'));
                        return;
                    }
                    
                    const blob = new Blob(chunks, { type: mimeType });
                    const compressionTime = ((Date.now() - startTime) / 1000).toFixed(1);
                    console.log(`视频压缩完成，大小: ${(blob.size / 1024 / 1024).toFixed(2)}MB, 格式: ${mimeType}, 耗时: ${compressionTime}秒`);
                    
                    // 使用异步文件读取，减少主线程阻塞
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        resolve(e.target.result);
                    };
                    reader.onerror = (err) => {
                        console.error('读取压缩视频失败:', err);
                        reject(err);
                    };
                    reader.readAsDataURL(blob);
                };
                
                mediaRecorder.onerror = (e) => {
                    reject(new Error('录制错误: ' + e.error));
                };
                
                // 开始录制，增加时间间隔以减少数据处理频率
                mediaRecorder.start(200); // 每200ms收集一次数据
                
                // 绘制视频帧，优化绘制逻辑
                const drawFrame = () => {
                    if (!video || video.ended || (video.paused && video.currentTime > 0 && !video.seeking)) {
                        if (mediaRecorder && mediaRecorder.state === 'recording') {
                            setTimeout(() => {
                                if (mediaRecorder && mediaRecorder.state === 'recording') {
                                    mediaRecorder.stop();
                                }
                            }, 300);
                        }
                        return;
                    }
                    
                    try {
                        // 只在视频播放时绘制帧
                        if (!video.paused && !video.ended) {
                            ctx.drawImage(video, 0, 0, width, height);
                        }
                        
                        // 更新进度（每800ms更新一次，减少回调频率）
                        const now = Date.now();
                        if (onProgress && (now - lastProgressTime > 800)) {
                            const currentTime = video.currentTime || 0;
                            const duration = video.duration || 1;
                            const progress = Math.min((currentTime / duration) * 100, 99); // 最多99%，等完成时再100%
                            onProgress(progress);
                            lastProgressTime = now;
                        }
                        
                        animationFrameId = requestAnimationFrame(drawFrame);
                    } catch (error) {
                        console.error('绘制视频帧失败:', error);
                        if (mediaRecorder && mediaRecorder.state === 'recording') {
                            mediaRecorder.stop();
                        }
                    }
                };
                
                // 播放视频并开始绘制
                video.play().then(() => {
                    console.log('视频开始播放，开始压缩');
                    drawFrame();
                }).catch((error) => {
                    console.error('视频播放失败:', error);
                    // 清理超时
                    if (loadTimeout) {
                        clearTimeout(loadTimeout);
                    }
                    // 如果播放失败，尝试直接读取原文件
                    reject(new Error('视频播放失败，无法压缩: ' + error.message));
                });
                
                // 监听视频结束
                video.onended = () => {
                    console.log('视频播放结束，停止录制');
                    if (mediaRecorder && mediaRecorder.state === 'recording') {
                        setTimeout(() => {
                            if (mediaRecorder.state === 'recording') {
                                mediaRecorder.stop();
                            }
                        }, 100);
                    }
                };
                
                // 设置超时保护（防止视频过长导致问题）
                const maxDuration = 300; // 5分钟
                setTimeout(() => {
                    if (mediaRecorder && mediaRecorder.state === 'recording') {
                        console.log('达到最大时长，停止录制');
                        mediaRecorder.stop();
                    }
                }, maxDuration * 1000);
                
            } catch (error) {
                reject(error);
            }
        };
        
        video.onerror = (e) => {
            if (loadTimeout) {
                clearTimeout(loadTimeout);
            }
            console.error('视频加载错误:', e);
            reject(new Error('视频加载失败，请检查文件格式是否正确'));
        };
        
        // 设置视频源
        try {
            const videoUrl = URL.createObjectURL(file);
            video.src = videoUrl;
            console.log('开始加载视频:', file.name, `大小: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
        } catch (error) {
            if (loadTimeout) {
                clearTimeout(loadTimeout);
            }
            reject(new Error('无法创建视频URL: ' + error.message));
        }
    });
}

// 页面切换功能
class PageSwitcher {
    constructor() {
        this.currentPage = 'about';
        this.pages = document.querySelectorAll('.page');
        this.navLinks = document.querySelectorAll('.nav-link');
        this.indicatorDots = document.querySelectorAll('.indicator-dot');
        this.init();
    }

    init() {
        // 检查URL hash并切换到对应页面
        this.checkUrlHash();

        // 导航品牌点击事件
        const navBrand = document.querySelector('.nav-brand');
        if (navBrand && navBrand.getAttribute('data-page')) {
            navBrand.addEventListener('click', () => {
                const targetPage = navBrand.getAttribute('data-page');
                this.switchPage(targetPage);
            });
        }

        // 导航链接点击事件
        this.navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetPage = link.getAttribute('data-page');
                this.switchPage(targetPage);
                this.closeMobileMenu();
            });
        });

        // 指示器点击事件
        this.indicatorDots.forEach(dot => {
            dot.addEventListener('click', () => {
                const targetPage = dot.getAttribute('data-page');
                this.switchPage(targetPage);
            });
        });

        // 按钮点击事件（首页的按钮）
        document.querySelectorAll('[data-page]').forEach(btn => {
            if (btn.classList.contains('btn')) {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const targetPage = btn.getAttribute('data-page');
                    if (targetPage) {
                        this.switchPage(targetPage);
                    }
                });
            }
        });

        // 键盘导航支持
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                this.nextPage();
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                this.prevPage();
            }
        });

        // 触摸滑动支持（移动端）
        this.initSwipe();

        // 监听URL hash变化
        window.addEventListener('hashchange', () => {
            this.checkUrlHash();
        });
    }

    // 检查URL hash并切换到对应页面
    checkUrlHash() {
        const hash = window.location.hash;
        if (hash) {
            const pageName = hash.substring(1); // 移除#号
            if (['about', 'projects', 'contact'].includes(pageName)) {
                this.switchPage(pageName);
            }
        }
    }

    switchPage(pageName) {
        if (this.currentPage === pageName) return;

        // 隐藏当前页面
        const currentPageEl = document.getElementById(this.currentPage);
        if (currentPageEl) {
            currentPageEl.classList.remove('active');
        }

        // 显示目标页面
        const targetPageEl = document.getElementById(pageName);
        if (targetPageEl) {
            targetPageEl.classList.add('active');
            this.currentPage = pageName;
            // 切换到作品页时确保封面已加载（解决隐藏容器内图片不加载的问题）
            if (pageName === 'projects' && typeof loadProjectCovers === 'function') {
                loadProjectCovers();
            }

            // 更新导航链接状态
            this.navLinks.forEach(link => {
                if (link.getAttribute('data-page') === pageName) {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            });

            // 更新指示器状态
            this.indicatorDots.forEach(dot => {
                if (dot.getAttribute('data-page') === pageName) {
                    dot.classList.add('active');
                } else {
                    dot.classList.remove('active');
                }
            });

            // 滚动到顶部
            window.scrollTo({ top: 0, behavior: 'smooth' });

            // 触发页面切换动画
            this.animatePageSwitch(targetPageEl);
        }
    }

    animatePageSwitch(pageEl) {
        // 添加进入动画
        pageEl.style.animation = 'none';
        setTimeout(() => {
            pageEl.style.animation = 'pageFadeIn 0.5s ease-in-out';
        }, 10);
    }

    nextPage() {
        const pageOrder = ['about', 'projects', 'contact'];
        const currentIndex = pageOrder.indexOf(this.currentPage);
        const nextIndex = (currentIndex + 1) % pageOrder.length;
        this.switchPage(pageOrder[nextIndex]);
    }

    prevPage() {
        const pageOrder = ['about', 'projects', 'contact'];
        const currentIndex = pageOrder.indexOf(this.currentPage);
        const prevIndex = (currentIndex - 1 + pageOrder.length) % pageOrder.length;
        this.switchPage(pageOrder[prevIndex]);
    }

    initSwipe() {
        let touchStartX = 0;
        let touchEndX = 0;
        let touchStartY = 0;
        let touchEndY = 0;

        document.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        });

        document.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            this.handleSwipe();
        });

        this.handleSwipe = () => {
            const deltaX = touchEndX - touchStartX;
            const deltaY = touchEndY - touchStartY;
            
            // 只处理水平滑动（且水平滑动距离大于垂直滑动）
            if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
                if (deltaX > 0) {
                    this.prevPage();
                } else {
                    this.nextPage();
                }
            }
        };
    }

    closeMobileMenu() {
        const hamburger = document.querySelector('.hamburger');
        const navMenu = document.querySelector('.nav-menu');
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
    }
}

// 移动端菜单切换
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');

if (hamburger && navMenu) {
    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
    });
}

// 初始化页面切换器
let pageSwitcher;
let isLoggedIn = false;

// 全局点击事件监听器，确保能够捕获所有点击事件
document.addEventListener('click', (e) => {
    // 处理查看详情按钮点击
    if (e.target.classList.contains('project-btn') || e.target.closest('.project-btn')) {
        const btn = e.target.closest('.project-btn');
        const projectId = btn.getAttribute('data-project-id');
        if (projectId) {
            console.log('全局监听器捕获到查看详情按钮点击，项目ID:', projectId);
            // 直接执行跳转，不依赖openModal函数
            window.location.href = `project.html?id=${projectId}`;
            console.log('执行了页面跳转:', `project.html?id=${projectId}`);
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    pageSwitcher = new PageSwitcher();
    
    // 初始化登录功能（必须先初始化，因为其他功能依赖登录状态）
    initLoginSystem();
    

    
    // 初始化动画
    initAnimations();
    animateNumbers();
    
    // 初始化作品详情模态框
    initProjectModal();
    
    // 初始化照片上传
    initPhotoUpload();
    
    // 初始化预览模态框（全局初始化）
    initPreviewModal();
    
    // 加载项目封面
    loadProjectCovers();
    
    // 直接为每个作品卡片的查看详情按钮添加点击事件监听器
    setTimeout(() => {
        const projectBtns = document.querySelectorAll('.project-btn');
        console.log('找到的查看详情按钮数量:', projectBtns.length);
        
        projectBtns.forEach((btn, index) => {
            btn.addEventListener('click', function() {
                const projectId = this.getAttribute('data-project-id');
                console.log('直接点击了查看详情按钮', index + 1, '，项目ID:', projectId);
                if (projectId) {
                    // 直接执行跳转，不依赖openModal函数
                    window.location.href = `project.html?id=${projectId}`;
                    console.log('执行了页面跳转:', `project.html?id=${projectId}`);
                }
            });
            console.log('为查看详情按钮添加了点击事件监听器，项目ID:', btn.getAttribute('data-project-id'));
        });
    }, 100);
});

// 照片上传功能
function initPhotoUpload() {
    const photoUpload = document.getElementById('photoUpload');
    const profilePhoto = document.getElementById('profilePhoto');
    const photoPlaceholder = document.getElementById('photoPlaceholder');
    const aboutPhoto = document.querySelector('.about-photo');
    
    // 从localStorage加载已保存的照片
    const savedPhoto = localStorage.getItem('profilePhoto');
    if (savedPhoto) {
        profilePhoto.src = savedPhoto;
        profilePhoto.style.display = 'block';
        photoPlaceholder.style.display = 'none';
    }
    
    // 点击照片区域上传（需要登录）
    aboutPhoto.addEventListener('click', () => {
        if (isLoggedIn) {
            photoUpload.click();
        } else {
            showLoginModal();
        }
    });
    
    // 文件选择
    photoUpload.addEventListener('change', (e) => {
        if (!isLoggedIn) {
            showLoginModal();
            return;
        }
        
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const imageUrl = e.target.result;
                profilePhoto.src = imageUrl;
                profilePhoto.style.display = 'block';
                photoPlaceholder.style.display = 'none';
                
                // 保存到localStorage
                localStorage.setItem('profilePhoto', imageUrl);
            };
            reader.readAsDataURL(file);
        }
    });
}

// 登录系统
function initLoginSystem() {
    const loginBtn = document.getElementById('loginBtn');
    const loginModal = document.getElementById('loginModal');
    const loginForm = document.getElementById('loginForm');
    const loginPassword = document.getElementById('loginPassword');
    const loginClose = document.querySelector('.login-close');
    const adminLoginBtn = document.getElementById('adminLoginBtn');
    const adminLogoutBtn = document.getElementById('adminLogoutBtn');
    
    // 默认密码（可以修改）
    const ADMIN_PASSWORD = 'admin123'; // 请修改为你自己的密码
    
    // 打开登录模态框
    function showLoginModal() {
        loginModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        setTimeout(() => loginPassword.focus(), 100);
    }
    
    // 导出供其他模块使用
    window.showLoginModal = showLoginModal;
    
    // 关闭登录模态框
    function closeLoginModal() {
        loginModal.classList.remove('active');
        document.body.style.overflow = '';
        loginPassword.value = '';
        document.getElementById('loginError').style.display = 'none';
    }
    
    // 检查登录状态
    function checkLoginStatus() {
        const loginTime = localStorage.getItem('adminLoginTime');
        const loginExpiry = localStorage.getItem('adminLoginExpiry');
        const now = Date.now();
        
        // 检查是否已登录且未过期（24小时有效期）
        if (loginTime && loginExpiry && now < parseInt(loginExpiry)) {
            isLoggedIn = true;
            updateUIForLogin();
        } else {
            isLoggedIn = false;
            updateUIForLogout();
            // 清除过期的登录信息
            if (loginTime) {
                localStorage.removeItem('adminLoginTime');
                localStorage.removeItem('adminLoginExpiry');
            }
        }
    }
    
    // 更新UI显示登录状态
    function updateUIForLogin() {
        if (loginBtn) loginBtn.style.display = 'none';
        if (adminLoginBtn) adminLoginBtn.style.display = 'none';
        if (adminLogoutBtn) adminLogoutBtn.style.display = 'block';
        document.body.classList.add('edit-mode');
        document.body.classList.remove('not-logged-in');
        
        // 显示所有上传区域
        const uploadSections = document.querySelectorAll('.upload-section');
        uploadSections.forEach(section => {
            section.style.display = 'block';
        });
        
        // 隐藏所有未登录提示
        const notLoggedInMsgs = document.querySelectorAll('.not-logged-in-message');
        notLoggedInMsgs.forEach(msg => {
            msg.style.display = 'none';
        });
        
        // 为可编辑内容添加编辑按钮
        addEditButtons();
        
        // 显示添加工作经验按钮
        const addExperienceBtn = document.getElementById('addExperienceBtn');
        if (addExperienceBtn) {
            addExperienceBtn.style.display = 'inline-block';
        }
        
        // 显示编辑联系文字按钮
        const editContactTextBtn = document.getElementById('editContactTextBtn');
        if (editContactTextBtn) {
            editContactTextBtn.style.display = 'block';
        }
        
        // 显示上传二维码按钮
        const uploadQrBtn = document.getElementById('uploadQrBtn');
        if (uploadQrBtn) {
            uploadQrBtn.style.display = 'inline-block';
        }
        
        // 重新渲染工作经验（显示编辑、删除、移动按钮）
        if (typeof renderExperiences === 'function') {
            renderExperiences();
        }
        
        // 重新渲染技能卡片（显示编辑、删除按钮）
        if (typeof renderSkills === 'function') {
            renderSkills();
        }
        
        // 显示添加作品按钮
        const addProjectBtn = document.querySelector('.add-project-btn');
        if (addProjectBtn) {
            addProjectBtn.style.display = 'block';
        }
        
        // 显示添加技能按钮
        const addSkillBtn = document.getElementById('addSkillBtn');
        if (addSkillBtn) {
            addSkillBtn.style.display = 'inline-block';
        }
        
        // 显示拖拽提示
        const dragHint = document.getElementById('dragHint');
        if (dragHint) {
            dragHint.style.display = 'block';
        }
        
        // 更新作品卡片的拖拽属性
        if (typeof updateDragListeners === 'function') {
            updateDragListeners();
        }
        
        console.log('已登录，显示上传功能和编辑按钮');



    }
    
    // 为可编辑内容添加编辑按钮
    function addEditButtons() {
        // 为项目卡片添加编辑按钮
        const projectCards = document.querySelectorAll('.project-card');
        projectCards.forEach((card, index) => {
            // 检查是否已经有编辑按钮
            if (!card.querySelector('.edit-btn')) {
                const editBtn = document.createElement('button');
                editBtn.className = 'edit-btn';
                editBtn.textContent = '✏️';
                editBtn.style.cssText = `
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    background: rgba(255, 255, 255, 0.9);
                    border: none;
                    border-radius: 50%;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    z-index: 10;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                `;
                editBtn.title = '编辑项目';
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const projectId = card.querySelector('.project-btn').getAttribute('data-project-id');
                    if (projectId) {
                        editProject(projectId);
                    }
                });
                card.style.position = 'relative';
                card.appendChild(editBtn);
            }
        });
        
        // 添加"添加作品"按钮
        const projectsSection = document.getElementById('projects');
        if (projectsSection && !projectsSection.querySelector('.add-project-btn')) {
            const addBtn = document.createElement('button');
            addBtn.className = 'add-project-btn';
            addBtn.textContent = '➕ 添加作品';
            addBtn.style.cssText = `
                display: block;
                margin: 2rem auto;
                padding: 12px 24px;
                background: var(--primary-blue);
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                cursor: pointer;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                transition: all 0.3s ease;
            `;
            addBtn.addEventListener('mouseenter', function() {
                this.style.transform = 'translateY(-2px)';
                this.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.15)';
            });
            addBtn.addEventListener('mouseleave', function() {
                this.style.transform = 'translateY(0)';
                this.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1)';
            });
            addBtn.addEventListener('click', addNewProject);
            projectsSection.querySelector('.container').appendChild(addBtn);
        }
        
        // 为关于我页面的文本元素添加编辑按钮
        const aboutSection = document.getElementById('about');
        if (aboutSection) {
            // 可编辑元素选择器
            const editableSelectors = [
                '.about-name',
                '.about-subtitle',
                '.about-description',
                '.stat-number',
                '.stat-label',
                '.timeline-title',
                '.timeline-date',
                '.timeline-company',
                '.timeline-position',
                '.timeline-description'
            ];
            
            editableSelectors.forEach(selector => {
                const elements = aboutSection.querySelectorAll(selector);
                elements.forEach((element, index) => {
                    // 检查是否已经有编辑按钮
                    if (!element.querySelector('.edit-text-btn')) {
                        const editBtn = document.createElement('button');
                        editBtn.className = 'edit-text-btn';
                        editBtn.textContent = '✏️';
                        editBtn.style.cssText = `
                            position: absolute;
                            top: 5px;
                            right: 5px;
                            background: rgba(255, 255, 255, 0.9);
                            border: none;
                            border-radius: 50%;
                            width: 20px;
                            height: 20px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            cursor: pointer;
                            z-index: 10;
                            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
                            font-size: 10px;
                        `;
                        editBtn.title = '编辑文本';
                        editBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            // 获取除了编辑按钮之外的文本内容
                            let currentText = '';
                            for (let i = 0; i < element.childNodes.length; i++) {
                                const node = element.childNodes[i];
                                if (node.nodeType === Node.TEXT_NODE) {
                                    currentText += node.textContent;
                                }
                            }
                            currentText = currentText.trim();
                            
                            const newText = prompt('请输入新的内容:', currentText);
                            if (newText !== null && newText.trim() !== '') {
                                // 保存编辑按钮
                                const editButton = element.querySelector('.edit-text-btn');
                                
                                // 清空元素内容
                                element.innerHTML = '';
                                
                                // 创建新的文本节点
                                const textNode = document.createTextNode(newText.trim());
                                element.appendChild(textNode);
                                
                                // 重新添加编辑按钮
                                if (editButton) {
                                    element.appendChild(editButton);
                                }
                                
                                // 保存到localStorage
                                const key = `about_${selector.replace('.', '')}_${index}`;
                                localStorage.setItem(key, newText.trim());
                            }
                        });
                        element.style.position = 'relative';
                        element.appendChild(editBtn);
                    }
                });
            });
        }
        

    }
    

    
    // 添加新作品
    function addNewProject() {
        // 创建添加表单
        const formHTML = `
            <div style="padding: 20px;">
                <h3>添加新作品</h3>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px;">项目ID：</label>
                    <input type="text" id="newProjectId" placeholder="例如：new-project" style="width: 100%; padding: 8px;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px;">标题：</label>
                    <input type="text" id="newProjectTitle" placeholder="输入作品标题" style="width: 100%; padding: 8px;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px;">描述：</label>
                    <textarea id="newProjectDescription" rows="5" placeholder="输入作品描述" style="width: 100%; padding: 8px;"></textarea>
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px;">标签（用逗号分隔）：</label>
                    <input type="text" id="newProjectTags" placeholder="例如：标签1, 标签2, 标签3" style="width: 100%; padding: 8px;">
                </div>
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button type="button" id="cancelAdd" style="padding: 8px 16px;">取消</button>
                    <button type="button" id="saveAdd" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px;">保存</button>
                </div>
            </div>
        `;
        
        // 创建模态框
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        `;
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white;
            border-radius: 8px;
            width: 90%;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        `;
        
        modalContent.innerHTML = formHTML;
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
        
        // 取消按钮
        document.getElementById('cancelAdd').addEventListener('click', () => {
            document.body.removeChild(modal);
            document.body.style.overflow = '';
        });
        
        // 保存按钮
        document.getElementById('saveAdd').addEventListener('click', () => {
            const projectId = document.getElementById('newProjectId').value.trim();
            const title = document.getElementById('newProjectTitle').value;
            const description = document.getElementById('newProjectDescription').value;
            const tags = document.getElementById('newProjectTags').value.split(',').map(tag => tag.trim()).filter(tag => tag);
            
            if (!projectId) {
                alert('请输入项目ID');
                return;
            }
            
            if (!title) {
                alert('请输入标题');
                return;
            }
            
            // 检查项目ID是否已存在
            if (projectData[projectId]) {
                alert('项目ID已存在，请使用其他ID');
                return;
            }
            
            // 添加新项目
            projectData[projectId] = {
                title,
                description,
                tags
            };
            
            // 保存到localStorage
            saveProjectData();
            
            // 刷新页面
            window.location.reload();
        });
        
        // 点击模态框外部关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
                document.body.style.overflow = '';
            }
        });
    }
    
    // 编辑项目
    function editProject(projectId) {
        const project = projectData[projectId];
        if (!project) return;
        
        // 创建编辑表单
        const formHTML = `
            <div style="padding: 20px;">
                <h3>编辑项目：${project.title}</h3>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px;">标题：</label>
                    <input type="text" id="editTitle" value="${project.title}" style="width: 100%; padding: 8px;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px;">描述：</label>
                    <textarea id="editDescription" rows="5" style="width: 100%; padding: 8px;">${project.description}</textarea>
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px;">标签（用逗号分隔）：</label>
                    <input type="text" id="editTags" value="${project.tags.join(', ')}" style="width: 100%; padding: 8px;">
                </div>
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button type="button" id="cancelEdit" style="padding: 8px 16px;">取消</button>
                    <button type="button" id="saveEdit" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px;">保存</button>
                </div>
            </div>
        `;
        
        // 创建模态框
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        `;
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white;
            border-radius: 8px;
            width: 90%;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        `;
        
        modalContent.innerHTML = formHTML;
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
        
        // 取消按钮
        document.getElementById('cancelEdit').addEventListener('click', () => {
            document.body.removeChild(modal);
            document.body.style.overflow = '';
        });
        
        // 保存按钮
        document.getElementById('saveEdit').addEventListener('click', () => {
            const title = document.getElementById('editTitle').value;
            const description = document.getElementById('editDescription').value;
            const tags = document.getElementById('editTags').value.split(',').map(tag => tag.trim()).filter(tag => tag);
            
            // 更新项目数据
            projectData[projectId] = {
                ...project,
                title,
                description,
                tags
            };
            
            // 保存到localStorage
            saveProjectData();
            
            // 刷新显示
            if (window.location.pathname.includes('project.html')) {
                // 如果在详情页，重新加载数据
                window.location.reload();
            } else {
                // 如果在首页，更新卡片显示
                const projectCard = document.querySelector(`.project-btn[data-project-id="${projectId}"]`).closest('.project-card');
                if (projectCard) {
                    projectCard.querySelector('.project-title').textContent = title;
                    projectCard.querySelector('.project-description').textContent = description;
                    
                    const tagsContainer = projectCard.querySelector('.project-tags');
                    tagsContainer.innerHTML = tags.map(tag => `<span class="tag">${tag}</span>`).join('');
                }
            }
            
            // 关闭模态框
            document.body.removeChild(modal);
            document.body.style.overflow = '';
            
            alert('项目已更新！');
        });
        
        // 点击模态框外部关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
                document.body.style.overflow = '';
            }
        });
    }
    
    // 更新UI显示登出状态
    function updateUIForLogout() {
        if (loginBtn) loginBtn.style.display = 'block';
        if (adminLoginBtn) adminLoginBtn.style.display = 'none';
        if (adminLogoutBtn) adminLogoutBtn.style.display = 'none';
        document.body.classList.remove('edit-mode');
        document.body.classList.add('not-logged-in');
        
        // 隐藏所有上传区域
        const uploadSections = document.querySelectorAll('.upload-section');
        uploadSections.forEach(section => {
            section.style.display = 'none';
        });
        
        // 显示所有未登录提示
        const notLoggedInMsgs = document.querySelectorAll('.not-logged-in-message');
        notLoggedInMsgs.forEach(msg => {
            msg.style.display = 'block';
        });
        
        // 移除所有编辑按钮
        const editButtons = document.querySelectorAll('.edit-btn, .edit-text-btn');
        editButtons.forEach(btn => {
            btn.remove();
        });
        
        // 隐藏添加工作经验按钮
        const addExperienceBtn = document.getElementById('addExperienceBtn');
        if (addExperienceBtn) {
            addExperienceBtn.style.display = 'none';
        }
        
        // 隐藏编辑联系文字按钮
        const editContactTextBtn = document.getElementById('editContactTextBtn');
        if (editContactTextBtn) {
            editContactTextBtn.style.display = 'none';
        }
        
        // 隐藏上传二维码按钮
        const uploadQrBtn = document.getElementById('uploadQrBtn');
        if (uploadQrBtn) {
            uploadQrBtn.style.display = 'none';
        }
        
        // 移除工作经验的编辑、删除、移动按钮
        const timelineItems = document.querySelectorAll('.timeline-item');
        timelineItems.forEach(item => {
            const buttons = item.querySelectorAll('button');
            buttons.forEach(btn => {
                btn.remove();
            });
        });
        
        // 隐藏添加作品按钮
        const addProjectBtn = document.querySelector('.add-project-btn');
        if (addProjectBtn) {
            addProjectBtn.style.display = 'none';
        }
        
        // 隐藏添加技能按钮
        const addSkillBtn = document.getElementById('addSkillBtn');
        if (addSkillBtn) {
            addSkillBtn.style.display = 'none';
        }
        
        // 隐藏拖拽提示
        const dragHint = document.getElementById('dragHint');
        if (dragHint) {
            dragHint.style.display = 'none';
        }
        
        // 重新渲染技能卡片（隐藏编辑、删除按钮）
        if (typeof renderSkills === 'function') {
            renderSkills();
        }
        
        // 更新作品卡片的拖拽属性
        if (typeof updateDragListeners === 'function') {
            updateDragListeners();
        }
        
        console.log('已登出，禁用所有编辑功能');



    }
    
    // 登录
    function login(password) {
        if (password === ADMIN_PASSWORD) {
            isLoggedIn = true;
            const now = Date.now();
            const expiry = now + (24 * 60 * 60 * 1000); // 24小时后过期
            
            localStorage.setItem('adminLoginTime', now.toString());
            localStorage.setItem('adminLoginExpiry', expiry.toString());
            
            updateUIForLogin();
            closeLoginModal();
            return true;
        } else {
            const errorDiv = document.getElementById('loginError');
            errorDiv.textContent = '密码错误，请重试';
            errorDiv.style.display = 'block';
            loginPassword.value = '';
            setTimeout(() => loginPassword.focus(), 100);
            return false;
        }
    }
    
    // 登出
    function logout() {
        if (confirm('确定要退出登录吗？')) {
            isLoggedIn = false;
            localStorage.removeItem('adminLoginTime');
            localStorage.removeItem('adminLoginExpiry');
            updateUIForLogout();
            // 手动移除导航编辑按钮
            const editNavButtons = document.querySelectorAll('.edit-nav-btn');
            editNavButtons.forEach(btn => {
                btn.remove();
            });
            // 确保所有编辑按钮都被移除
            const navBrand = document.querySelector('.nav-brand');
            if (navBrand) {
                const editBtn = navBrand.querySelector('.edit-nav-btn');
                if (editBtn) {
                    editBtn.remove();
                }
            }
        }
    }
    
    // 事件监听
    if (loginBtn) {
        loginBtn.addEventListener('click', showLoginModal);
    }
    if (adminLoginBtn) {
        adminLoginBtn.addEventListener('click', showLoginModal);
    }
    if (adminLogoutBtn) {
        adminLogoutBtn.addEventListener('click', logout);
    }
    if (loginClose) {
        loginClose.addEventListener('click', closeLoginModal);
    }
    
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const password = loginPassword.value.trim();
            if (password) {
                login(password);
            }
        });
    }
    
    // 点击模态框外部关闭
    if (loginModal) {
        loginModal.addEventListener('click', (e) => {
            if (e.target === loginModal) {
                closeLoginModal();
            }
        });
    }
    
    // ESC键关闭
    document.addEventListener('keydown', (e) => {
        if (loginModal && e.key === 'Escape' && loginModal.classList.contains('active')) {
            closeLoginModal();
        }
    });
    
    // 初始化UI状态
    checkLoginStatus();
    
    // 导出登录状态检查函数供其他模块使用
    window.checkLoginStatus = checkLoginStatus;
    window.isLoggedIn = () => isLoggedIn;
}

// 滚动动画
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
        }
    });
}, observerOptions);

function initAnimations() {
    const animateElements = document.querySelectorAll('.skill-card, .project-card, .stat-item');
    animateElements.forEach(el => {
        el.classList.add('fade-in');
        observer.observe(el);
    });
}

// 表单提交处理
const contactForm = document.querySelector('.contact-form');
if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const name = contactForm.querySelector('input[type="text"]').value;
        const email = contactForm.querySelector('input[type="email"]').value;
        const message = contactForm.querySelector('textarea').value;
        
        console.log('表单提交:', { name, email, message });
        
        // 显示成功消息（可以用更美观的提示替换）
        alert('🎉 感谢您的留言！我会尽快回复您。');
        
        // 重置表单
        contactForm.reset();
    });
}

// 数字动画效果（统计数字）
const animateNumbers = () => {
    const statNumbers = document.querySelectorAll('.stat-number[data-target]');
    
    statNumbers.forEach(stat => {
        const target = parseFloat(stat.getAttribute('data-target'));
        const isDecimal = target % 1 !== 0;
        
        if (isNaN(target)) return;
        
        const duration = 2000;
        const startTime = Date.now();
        
        const updateNumber = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // 使用缓动函数
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            const current = target * easeOutQuart;
            
            if (isDecimal) {
                stat.textContent = current.toFixed(2);
            } else {
                stat.textContent = Math.floor(current);
            }
            
            if (progress < 1) {
                requestAnimationFrame(updateNumber);
            } else {
                if (isDecimal) {
                    stat.textContent = target.toFixed(2);
                } else {
                    stat.textContent = target;
                }
            }
        };
        
        // 当元素进入视口时开始动画
        const statObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    updateNumber();
                    statObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.5 });
        
        statObserver.observe(stat);
    });
};

// 项目卡片交互
document.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('mouseenter', function() {
        this.style.transition = 'all 0.3s ease';
    });
});

// 技能卡片点击效果
document.querySelectorAll('.skill-card').forEach(card => {
    card.addEventListener('click', function() {
        this.style.transform = 'scale(0.95)';
        setTimeout(() => {
            this.style.transform = '';
        }, 150);
    });
});

// 项目数据（全局变量，供所有页面使用）
let projectData = {
        'ai-works': {
            title: 'AI作品合集',
            description: '运用多种AI工具进行创意制作，包括可灵、即梦、豆包、通义、海螺、Sora等。涵盖视频生成、图像创作、文案优化等多个领域。通过AI技术提升创作效率，探索AI与内容创作的创新结合，产出高质量的数字媒体作品。',
            tags: ['AI生成', '创意制作', '数字媒体']
        },
        'danmei': {
            title: '大广赛作品《丹媚在，没意外》',
            description: '作为负责人和导演，统筹项目全流程，组建团队并制定执行计划。主导创意构思与脚本撰写，运用AI技术（可灵、即梦、豆包、通义、海螺、Sora）完成成片制作，把控作品风格与质量。作品获全国大学生广告艺术大赛三等奖。',
            tags: ['AI制作', '视频剪辑', '广告创意']
        },
        'wansheng': {
            title: '毕业联合作品《万物生》',
            description: '担任负责人/导演/摄像，统筹项目全流程，牵头组建跨专业创作团队，制定执行计划与分工。同时对接学校推进项目申报与合约签订。成功推动项目获校级立项并与学校签订合作合约，获得专项支持。',
            tags: ['导演', '摄像', '项目管理']
        },
        'guoshu': {
            title: '自媒体运营｜果蔬瓶🍎',
            description: '负责账号内容策划、拍摄剪辑与平台运营，担任导演/拍摄/剪辑/出镜。通过后台数据分析，优化标题/标签提升曝光。同期策划并拍摄品牌广告内容。成果：一周内粉丝破千，小红书均浏览2k+、抖音均浏览10w+；广告获小红书1w+浏览/5k+点赞、抖音100w+浏览。',
            tags: ['自媒体', '内容运营', '短视频']
        },
        'professor': {
            title: '教授助理工作',
            description: '协助教授开展学术研究，负责选题调研、资料筛选核查、文章逻辑框架搭建及初稿撰写；多篇文章成功发表于国家级刊物《中国报道》。主导《华人世界》杂志封面创意设计、内页版面排版，统筹视觉风格统一。',
            tags: ['学术研究', '视觉设计', '期刊编辑']
        }
};

// 从localStorage加载项目数据
function loadProjectData() {
    try {
        const savedData = localStorage.getItem('projectData');
        if (savedData) {
            projectData = JSON.parse(savedData);
            console.log('从localStorage加载项目数据成功');
        } else {
            // 首次加载，保存默认数据到localStorage
            saveProjectData();
            console.log('保存默认项目数据到localStorage');
        }
    } catch (error) {
        console.error('加载项目数据失败:', error);
        // 加载失败，使用默认数据
    }
}

// 保存项目数据到localStorage
function saveProjectData() {
    try {
        localStorage.setItem('projectData', JSON.stringify(projectData));
        console.log('项目数据已保存到localStorage');
    } catch (error) {
        console.error('保存项目数据失败:', error);
    }
}

// 初始化时加载项目数据
loadProjectData();

// 导出函数供其他模块使用
window.loadProjectData = loadProjectData;
window.saveProjectData = saveProjectData;

// IndexedDB 数据库管理
const DB_NAME = 'portfolio_media_db';
const DB_VERSION = 1;
const STORE_NAME = 'project_media';

let db = null;

// 初始化 IndexedDB
function initDB() {
        return new Promise((resolve, reject) => {
            if (db) {
                resolve(db);
                return;
            }
            
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = () => {
                console.error('IndexedDB 打开失败:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                db = request.result;
                console.log('IndexedDB 打开成功');
                resolve(db);
            };
            
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'projectId' });
                    objectStore.createIndex('projectId', 'projectId', { unique: true });
                }
            };
        });
}

// 存储每个项目的媒体文件（使用IndexedDB存储大文件，localStorage存储元数据）
async function getProjectMedia(projectId) {
    try {
        // 先尝试从 IndexedDB 读取
        await initDB();
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(projectId);
        
        return new Promise((resolve) => {
            request.onsuccess = () => {
                if (request.result && request.result.mediaArray) {
                    console.log(`从 IndexedDB 读取项目 ${projectId}，共 ${request.result.mediaArray.length} 个文件`);
                    resolve(request.result.mediaArray);
                } else {
                    // 回退到 localStorage（兼容旧数据）
                    try {
                        const stored = localStorage.getItem(`project_media_${projectId}`);
                        const result = stored ? JSON.parse(stored) : [];
                        console.log(`从 localStorage 读取项目 ${projectId}，共 ${result.length} 个文件`);
                        resolve(result);
                    } catch (error) {
                        console.error('读取媒体数据失败:', error);
                        resolve([]);
                    }
                }
            };
            
            request.onerror = () => {
                // 回退到 localStorage
                try {
                    const stored = localStorage.getItem(`project_media_${projectId}`);
                    const result = stored ? JSON.parse(stored) : [];
                    resolve(result);
                } catch (error) {
                    console.error('读取媒体数据失败:', error);
                    resolve([]);
                }
            };
        });
    } catch (error) {
        console.error('IndexedDB 读取失败，回退到 localStorage:', error);
        try {
            const stored = localStorage.getItem(`project_media_${projectId}`);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error('读取媒体数据失败:', e);
            return [];
        }
    }
}

async function saveProjectMedia(projectId, mediaArray) {
    try {
        // 计算总大小
        let totalSize = 0;
        mediaArray.forEach(media => {
            if (media.url) {
                totalSize += media.url.length;
            }
        });
        
        // 如果数据较大（>5MB），使用 IndexedDB
        if (totalSize > 5 * 1024 * 1024) {
            await initDB();
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const data = {
                projectId: projectId,
                mediaArray: mediaArray,
                updatedAt: new Date().toISOString()
            };
            
            return new Promise((resolve) => {
                const request = store.put(data);
                request.onsuccess = () => {
                    console.log(`项目 ${projectId} 的媒体数据已保存到 IndexedDB，共 ${mediaArray.length} 个文件，总大小: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
                    resolve(true);
                };
                request.onerror = () => {
                    console.error('IndexedDB 保存失败，回退到 localStorage:', request.error);
                    // 回退到 localStorage（只保存元数据，不保存大文件）
                    try {
                        const metadata = mediaArray.map(m => ({
                            type: m.type,
                            name: m.name,
                            mimeType: m.mimeType,
                            size: m.size,
                            uploadTime: m.uploadTime,
                            // 不保存完整的 base64 URL，只保存引用
                            url: m.url ? m.url.substring(0, 100) + '...' : ''
                        }));
                        localStorage.setItem(`project_media_${projectId}`, JSON.stringify(metadata));
                        console.warn('数据过大，已保存元数据到 localStorage，但完整数据可能丢失');
                        resolve(false);
                    } catch (e) {
                        console.error('保存失败:', e);
                        resolve(false);
                    }
                };
            });
        } else {
            // 小数据使用 localStorage
            const dataString = JSON.stringify(mediaArray);
            localStorage.setItem(`project_media_${projectId}`, dataString);
            console.log(`项目 ${projectId} 的媒体数据已保存到 localStorage，共 ${mediaArray.length} 个文件`);
            return true;
        }
    } catch (error) {
        console.error('保存媒体数据失败:', error);
        // 尝试保存到 localStorage 作为备份
        try {
            const metadata = mediaArray.map(m => ({
                type: m.type,
                name: m.name,
                mimeType: m.mimeType,
                size: m.size,
                uploadTime: m.uploadTime
            }));
            localStorage.setItem(`project_media_${projectId}`, JSON.stringify(metadata));
            return false;
        } catch (e) {
            return false;
        }
    }
}

// 图片压缩函数（不限制尺寸，只压缩质量）
function compressImage(file, quality = 0.85) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    // 保持原始尺寸，不限制
                    canvas.width = img.width;
                    canvas.height = img.height;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    
                    // 转换为 base64，只压缩质量
                    canvas.toBlob((blob) => {
                        const reader2 = new FileReader();
                        reader2.onload = function(e2) {
                            resolve(e2.target.result);
                        };
                        reader2.onerror = reject;
                        reader2.readAsDataURL(blob);
                    }, 'image/jpeg', quality);
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
}

// 当前项目ID（全局变量）
let currentProjectId = null;

// 打开作品详情页面（跳转到新页面）
function openModal(projectId) {
    // 跳转到作品详情页面
    window.location.href = `project.html?id=${projectId}`;
}

// 关闭模态框（只在主页面时有效）
function closeModal() {
    const modal = document.getElementById('projectModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
    currentProjectId = null;
}

// 作品详情模态框功能（现在用于独立页面）
function initProjectModal() {
    // 如果是作品详情页面，不需要初始化模态框
    if (window.location.pathname.includes('project.html')) {
        return;
    }

    // 确保 previewName 元素存在时才操作
    const previewName = document.getElementById('previewName');
    if (previewName) {
        previewName.style.display = 'none'; // 默认隐藏文件名
    }
    
    // 初始化事件监听
    initProjectModalEventListeners();
}

// 全屏预览功能（全局函数）
let currentPreviewProjectId = null;
let currentPreviewIndex = 0;
let previewMediaArray = [];

async function openPreview(projectId, index) {
    const previewModal = document.getElementById('previewModal');
    const previewContent = document.getElementById('previewContent');
    
    if (!previewModal || !previewContent) {
        console.error('预览模态框元素不存在');
        return;
    }
    
    // 确保预览模态框已初始化
    if (!previewModalInitialized) {
        initPreviewModal();
    }
    
    currentPreviewProjectId = projectId;
    currentPreviewIndex = index;
    previewMediaArray = await getProjectMedia(projectId);
    
    console.log('打开预览:', {
        projectId,
        index,
        mediaCount: previewMediaArray.length
    });
    
    if (previewMediaArray.length === 0) {
        console.warn('没有媒体文件可预览');
        return;
    }
    
    // 确保索引有效
    if (index < 0) index = 0;
    if (index >= previewMediaArray.length) index = previewMediaArray.length - 1;
    currentPreviewIndex = index;
    
    // 更新预览内容
    updatePreviewContent();
    
    // 显示模态框
    previewModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    console.log('预览已打开:', {
        index: currentPreviewIndex + 1,
        total: previewMediaArray.length,
        canNavigate: previewMediaArray.length > 1
    });
}

function closePreview() {
    const previewModal = document.getElementById('previewModal');
    const previewContent = document.getElementById('previewContent');
    
    if (!previewModal) {
        return;
    }
    
    // 先暂停并清理视频
    if (previewContent) {
        const video = previewContent.querySelector('video');
        if (video) {
            video.pause();
            video.src = '';
            video.load();
        }
        previewContent.innerHTML = '';
    }
    
    // 移除active类
    previewModal.classList.remove('active');
    
    // 恢复页面滚动
    document.body.style.overflow = '';
    
    // 重置预览状态
    currentPreviewProjectId = null;
    currentPreviewIndex = 0;
    previewMediaArray = [];
    
    console.log('预览已关闭');
}

function updatePreviewContent() {
    const previewContent = document.getElementById('previewContent');
    const previewCounter = document.getElementById('previewCounter');
    const previewName = document.getElementById('previewName');
    
    if (!previewContent) return;
    
    if (previewMediaArray.length === 0) {
        closePreview();
        return;
    }
    
    // 在切换前，先暂停并移除之前的视频（如果有）
    const oldVideo = previewContent.querySelector('video');
    if (oldVideo) {
        oldVideo.pause();
        oldVideo.src = '';
        oldVideo.load();
    }
    
    const media = previewMediaArray[currentPreviewIndex];
    previewContent.innerHTML = '';
    
    if (media.type === 'image') {
        const img = document.createElement('img');
        img.src = media.url;
        img.alt = media.name || '作品图片';
        img.onerror = function() {
            previewContent.innerHTML = '<div style="color: white; text-align: center; padding: 2rem;">图片加载失败</div>';
        };
        previewContent.appendChild(img);
    } else if (media.type === 'video') {
        const video = document.createElement('video');
        video.src = media.url;
        video.controls = true;
        video.autoplay = false; // 改为false，让用户手动播放
        video.style.maxWidth = '95vw';
        video.style.maxHeight = '90vh';
        if (media.mimeType) {
            video.setAttribute('type', media.mimeType);
        }
        // 添加视频加载完成后的处理
        video.addEventListener('loadedmetadata', () => {
            console.log('视频元数据加载完成');
        });
        previewContent.appendChild(video);
    }
    
    // 更新信息（只显示序号，不显示文件名）
    if (previewCounter) {
        previewCounter.textContent = `${currentPreviewIndex + 1} / ${previewMediaArray.length}`;
    }
    if (previewName) {
        previewName.style.display = 'none'; // 隐藏文件名
    }
    
    // 更新导航按钮状态（确保即使只有一个媒体文件也显示按钮，但禁用点击）
    const previewPrevBtn = document.getElementById('previewPrev');
    const previewNextBtn = document.getElementById('previewNext');
    
    const hasMultipleItems = previewMediaArray.length > 1;
    
    if (previewPrevBtn) {
        if (hasMultipleItems) {
            previewPrevBtn.style.display = 'flex';
            previewPrevBtn.style.pointerEvents = 'auto';
            previewPrevBtn.style.opacity = '1';
        } else {
            previewPrevBtn.style.display = 'none';
            previewPrevBtn.style.pointerEvents = 'none';
        }
    }
    
    if (previewNextBtn) {
        if (hasMultipleItems) {
            previewNextBtn.style.display = 'flex';
            previewNextBtn.style.pointerEvents = 'auto';
            previewNextBtn.style.opacity = '1';
        } else {
            previewNextBtn.style.display = 'none';
            previewNextBtn.style.pointerEvents = 'none';
        }
    }
    
    console.log('更新预览内容:', {
        index: currentPreviewIndex,
        total: previewMediaArray.length,
        type: media.type,
        hasMultipleItems: hasMultipleItems
    });
}

function previewPrevItem() {
    if (previewMediaArray.length === 0) {
        console.warn('预览数组为空，无法切换');
        return;
    }
    if (previewMediaArray.length <= 1) {
        console.warn('只有一个媒体文件，无法切换');
        return;
    }
    
    // 先暂停当前视频
    const previewContent = document.getElementById('previewContent');
    if (previewContent) {
        const currentVideo = previewContent.querySelector('video');
        if (currentVideo) {
            currentVideo.pause();
            currentVideo.currentTime = 0;
        }
    }
    
    currentPreviewIndex = (currentPreviewIndex - 1 + previewMediaArray.length) % previewMediaArray.length;
    console.log('切换到上一个:', currentPreviewIndex + 1, '/', previewMediaArray.length);
    updatePreviewContent();
}

function previewNextItem() {
    if (previewMediaArray.length === 0) {
        console.warn('预览数组为空，无法切换');
        return;
    }
    if (previewMediaArray.length <= 1) {
        console.warn('只有一个媒体文件，无法切换');
        return;
    }
    
    // 先暂停当前视频
    const previewContent = document.getElementById('previewContent');
    if (previewContent) {
        const currentVideo = previewContent.querySelector('video');
        if (currentVideo) {
            currentVideo.pause();
            currentVideo.currentTime = 0;
        }
    }
    
    currentPreviewIndex = (currentPreviewIndex + 1) % previewMediaArray.length;
    console.log('切换到下一个:', currentPreviewIndex + 1, '/', previewMediaArray.length);
    updatePreviewContent();
}

// 初始化预览模态框事件监听（使用事件委托，避免重复绑定）
let previewModalInitialized = false;
let previewKeyboardHandler = null;

function initPreviewModal() {
    // 如果已经初始化过，直接返回
    if (previewModalInitialized) {
        return;
    }
    
    const previewModal = document.getElementById('previewModal');
    
    if (!previewModal) {
        return; // 如果模态框不存在，直接返回
    }
    
    // 使用事件委托，在模态框上统一处理所有点击事件
    previewModal.addEventListener('click', (e) => {
        // 点击关闭按钮
        if (e.target.classList.contains('preview-close') || e.target.closest('.preview-close')) {
            e.preventDefault();
            e.stopPropagation();
            closePreview();
            return;
        }
        
        // 点击上一个按钮
        if (e.target.id === 'previewPrev' || e.target.closest('#previewPrev')) {
            e.preventDefault();
            e.stopPropagation();
            previewPrevItem();
            return;
        }
        
        // 点击下一个按钮
        if (e.target.id === 'previewNext' || e.target.closest('#previewNext')) {
            e.preventDefault();
            e.stopPropagation();
            previewNextItem();
            return;
        }
        
        // 点击背景（模态框本身）关闭
        if (e.target === previewModal) {
            closePreview();
            return;
        }
    });
    
    // 键盘导航（全局事件，但只在模态框激活时响应）
    previewKeyboardHandler = function(e) {
        const modal = document.getElementById('previewModal');
        if (modal && modal.classList.contains('active')) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closePreview();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                e.stopPropagation();
                previewPrevItem();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                e.stopPropagation();
                previewNextItem();
            }
        }
    };
    
    document.addEventListener('keydown', previewKeyboardHandler);
    
    previewModalInitialized = true;
    console.log('预览模态框事件监听已初始化');
}

// 加载项目媒体（带懒加载）
async function loadProjectMedia(projectId) {
    const galleryGrid = document.getElementById('galleryGrid');
    if (!galleryGrid) {
        console.error('找不到 galleryGrid 元素');
        return;
    }
    
    const mediaArray = await getProjectMedia(projectId);
    console.log(`加载项目 ${projectId} 的媒体，共 ${mediaArray.length} 个文件`);
    galleryGrid.innerHTML = '';
    
    if (mediaArray.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-gallery';
        emptyMsg.style.cssText = 'text-align: center; padding: 2rem; color: var(--text-secondary);';
        if (isLoggedIn) {
            emptyMsg.textContent = '暂无作品，快来上传吧！📸';
        } else {
            emptyMsg.textContent = '暂无作品展示';
        }
        galleryGrid.appendChild(emptyMsg);
        return;
    }
    
    // 创建媒体项但延迟加载
    const mediaItems = [];
    
    mediaArray.forEach((media, index) => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.setAttribute('data-index', index);
        
        // 创建占位符
        const placeholder = document.createElement('div');
        placeholder.className = 'media-placeholder';
        placeholder.style.cssText = `
            width: 100%;
            height: 200px;
            background: #f0f0f0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #999;
            position: relative;
        `;
        placeholder.textContent = media.type === 'image' ? '📷' : '🎬';
        
        item.appendChild(placeholder);
        galleryGrid.appendChild(item);
        mediaItems.push({ item, media, index });
    });
    
    // 延迟加载媒体，分批处理
    await lazyLoadMediaItems(mediaItems, projectId);
}

// 懒加载媒体项（分批处理）
async function lazyLoadMediaItems(mediaItems, projectId) {
    const batchSize = 3; // 每批加载3个媒体
    const delayBetweenBatches = 500; // 批次间延迟500ms
    
    for (let i = 0; i < mediaItems.length; i += batchSize) {
        const batch = mediaItems.slice(i, i + batchSize);
        await Promise.all(batch.map(async (mediaItem) => {
            await loadSingleMediaItem(mediaItem.item, mediaItem.media, mediaItem.index, projectId);
        }));
        
        if (i + batchSize < mediaItems.length) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
    }
}

// 加载单个媒体项
async function loadSingleMediaItem(item, media, index, projectId) {
    return new Promise((resolve) => {
        // 移除占位符
        const placeholder = item.querySelector('.media-placeholder');
        if (placeholder) {
            placeholder.remove();
        }
        
        console.log('加载媒体:', media.type, media.name, media.mimeType);
        
        if (media.type === 'image') {
            const img = document.createElement('img');
            img.src = media.url;
            img.alt = '作品图片';
            img.style.cssText = 'width: 100%; height: 200px; object-fit: cover; display: block;';
            img.onerror = function() {
                console.error('图片加载失败:', media.name);
                this.style.display = 'none';
                const errorMsg = document.createElement('div');
                errorMsg.style.cssText = 'padding: 1rem; color: var(--text-secondary); text-align: center;';
                errorMsg.textContent = '图片加载失败';
                item.appendChild(errorMsg);
                resolve();
            };
            img.onload = function() {
                console.log('图片加载成功:', media.name);
                resolve();
            };
            // 添加点击预览事件
            img.addEventListener('click', (e) => {
                e.stopPropagation();
                openPreview(projectId, index);
            });
            item.appendChild(img);
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = '×';
            deleteBtn.setAttribute('data-index', index);
            item.appendChild(deleteBtn);
        } else if (media.type === 'video') {
            console.log(`创建视频元素 ${index}:`, {
                name: media.name,
                mimeType: media.mimeType,
                urlLength: media.url ? media.url.length : 0,
                urlPreview: media.url ? media.url.substring(0, 100) : 'null'
            });
            
            // 创建视频元素
            const videoElement = document.createElement('video');
            videoElement.controls = true;
            videoElement.preload = 'metadata'; // 只预加载元数据
            videoElement.style.cssText = 'width: 100%; height: 200px; object-fit: cover; display: block; background: #000;';
            
            // 检查URL是否有效
            if (!media.url || media.url.length < 100) {
                console.error('视频URL无效:', media);
                const errorDiv = document.createElement('div');
                errorDiv.style.cssText = 'padding: 1rem; color: var(--text-secondary); text-align: center;';
                errorDiv.textContent = `视频数据无效: ${media.name}`;
                item.appendChild(errorDiv);
                resolve();
                return;
            }
            
            // 直接设置src，不使用source元素（更兼容）
            videoElement.src = media.url;
            
            // 如果指定了mimeType，尝试设置type属性
            if (media.mimeType) {
                videoElement.setAttribute('type', media.mimeType);
            }
            
            // 添加错误处理
            videoElement.onerror = function(e) {
                console.error('视频加载失败:', {
                    name: media.name,
                    mimeType: media.mimeType,
                    urlLength: media.url ? media.url.length : 0,
                    error: videoElement.error,
                    errorCode: videoElement.error ? videoElement.error.code : 'unknown'
                });
                
                // 显示错误信息
                const errorDiv = document.createElement('div');
                errorDiv.style.cssText = 'padding: 1rem; color: var(--text-secondary); text-align: center; font-size: 0.9rem;';
                errorDiv.innerHTML = `视频无法播放<br><small>${media.name}</small><br><small style="color: #999;">错误代码: ${videoElement.error ? videoElement.error.code : 'unknown'}</small>`;
                videoElement.style.display = 'none';
                item.appendChild(errorDiv);
                resolve();
            };
            
            // 监听加载成功
            videoElement.onloadedmetadata = function() {
                console.log('视频元数据加载成功:', {
                    name: media.name,
                    duration: videoElement.duration,
                    videoWidth: videoElement.videoWidth,
                    videoHeight: videoElement.videoHeight
                });
            };
            
            videoElement.oncanplay = function() {
                console.log('视频可以播放:', media.name);
                resolve();
            };
            
            // 添加点击预览事件 - 点击视频区域（非控制栏）打开预览
            videoElement.addEventListener('click', (e) => {
                // 检查点击位置是否在控制栏上
                const rect = videoElement.getBoundingClientRect();
                const clickY = e.clientY - rect.top;
                const videoHeight = rect.height;
                // 如果点击在视频下方20%区域（通常是控制栏），不触发预览
                if (clickY < videoHeight * 0.8) {
                    e.stopPropagation();
                    openPreview(projectId, index);
                }
            });
            
            // 双击全屏预览
            videoElement.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                openPreview(projectId, index);
            });
            
            item.appendChild(videoElement);
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = '×';
            deleteBtn.setAttribute('data-index', index);
            item.appendChild(deleteBtn);
        } else if (media.type === 'ppt' || media.type === 'pdf') {
            // 创建文件显示区域
            const fileContainer = document.createElement('div');
            fileContainer.style.cssText = 'width: 100%; height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #f0f0f0; border: 1px solid #ddd; border-radius: 4px;';
            
            // 添加文件图标
            const fileIcon = document.createElement('div');
            fileIcon.style.cssText = 'font-size: 3rem; margin-bottom: 0.5rem;';
            fileIcon.textContent = media.type === 'ppt' ? '📄' : '📋';
            fileContainer.appendChild(fileIcon);
            
            // 添加文件名
            const fileName = document.createElement('div');
            fileName.style.cssText = 'font-size: 0.9rem; color: var(--text-primary); text-align: center; padding: 0 1rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%;';
            fileName.textContent = media.name;
            fileContainer.appendChild(fileName);
            
            // 添加文件大小
            const fileSize = document.createElement('div');
            fileSize.style.cssText = 'font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;';
            fileSize.textContent = `${(media.size / 1024 / 1024).toFixed(2)} MB`;
            fileContainer.appendChild(fileSize);
            
            // 添加点击下载事件
            fileContainer.addEventListener('click', (e) => {
                e.stopPropagation();
                // 创建下载链接
                const link = document.createElement('a');
                link.href = media.url;
                link.download = media.name;
                link.click();
            });
            
            item.appendChild(fileContainer);
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = '×';
            deleteBtn.setAttribute('data-index', index);
            item.appendChild(deleteBtn);
        }
        
        // 删除按钮事件（显示由CSS控制）
        const deleteBtn = item.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await deleteMedia(projectId, index);
            });
        }
        
        // 如果是图片且加载快速，直接resolve
        if (media.type === 'image') {
            setTimeout(resolve, 100);
        }
    });
}

// 删除媒体
async function deleteMedia(projectId, index) {
    if (!isLoggedIn) {
        alert('请先登录才能删除作品');
        if (window.showLoginModal) {
            window.showLoginModal();
        }
        return;
    }
    
    if (confirm('确定要删除这个作品吗？')) {
        const mediaArray = await getProjectMedia(projectId);
        mediaArray.splice(index, 1);
        await saveProjectMedia(projectId, mediaArray);
        await loadProjectMedia(projectId);
    }
}

// 上传文件
async function uploadFiles(files) {
    // 检查登录状态
    if (!isLoggedIn) {
        alert('请先登录才能上传作品');
        if (window.showLoginModal) {
            window.showLoginModal();
        }
        return;
    }
    
    if (!currentProjectId || !files || files.length === 0) {
        console.error('上传失败：缺少项目ID或文件');
        return;
    }
    
    const uploadProgress = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const fileInputElement = document.getElementById('fileInput');
    
    if (!uploadProgress || !progressFill || !progressText) {
        console.error('上传失败：找不到进度元素');
        return;
    }
    
    // 显示进度条
    uploadProgress.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = '准备上传...';
    
    // 获取当前项目的媒体数组（每次重新获取，确保是最新的）
    let mediaArray = await getProjectMedia(currentProjectId);
    let completedCount = 0;
    let errorCount = 0;
    const totalFiles = files.length;
    const fileArray = Array.from(files);
    
    console.log(`开始上传 ${totalFiles} 个文件`);
    
    // 如果没有文件，直接返回
    if (totalFiles === 0) {
        uploadProgress.style.display = 'none';
        return;
    }
    
    try {
        // 处理每个文件（使用for循环确保顺序处理）
        for (let index = 0; index < fileArray.length; index++) {
            const file = fileArray[index];
            
            // 检查文件类型
            if (!file.type.startsWith('image/') && !file.type.startsWith('video/') && !file.type.includes('powerpoint') && !file.type.includes('presentation') && !file.type.includes('pdf')) {
                console.warn(`文件 "${file.name}" 类型不支持`);
                errorCount++;
                completedCount++;
                checkAllCompleted();
                continue;
            }
            
            // 处理图片压缩和文件读取（使用立即执行函数确保每个文件独立处理）
            await (async () => {
                try {
                    let fileUrl;
                    let fileMimeType = file.type;
                    
                    // 更新进度：开始处理文件
                    const fileProgress = (index / totalFiles) * 100;
                    progressFill.style.width = fileProgress + '%';
                    progressText.textContent = `处理中... ${index + 1}/${totalFiles} - ${file.name.substring(0, 20)}...`;
                    
                    // 如果是图片，先压缩
                    if (file.type.startsWith('image/')) {
                        progressText.textContent = `压缩图片中... ${index + 1}/${totalFiles} - ${file.name.substring(0, 20)}...`;
                        try {
                            fileUrl = await compressImage(file);
                            fileMimeType = 'image/jpeg'; // 压缩后统一为 JPEG
                            console.log(`图片压缩完成: ${file.name}`);
                        } catch (compressError) {
                            console.warn('压缩失败，使用原图:', compressError);
                            // 压缩失败，使用原始文件
                            const reader = new FileReader();
                            fileUrl = await new Promise((resolve, reject) => {
                                reader.onload = (e) => resolve(e.target.result);
                                reader.onerror = reject;
                                reader.readAsDataURL(file);
                            });
                        }
                    } else {
                        // 视频文件处理 - 完全不压缩，直接上传原始视频以保持最高画质和音频
                        progressText.textContent = `读取视频中（原始画质）... ${file.name.substring(0, 20)}...`;
                        const reader = new FileReader();
                        fileUrl = await new Promise((resolve, reject) => {
                            reader.onload = (e) => resolve(e.target.result);
                            reader.onerror = reject;
                            reader.onprogress = (e) => {
                                if (e.lengthComputable) {
                                    const fileProgress = (e.loaded / e.total) * 100;
                                    const overallProgress = ((completedCount + fileProgress / 100) / totalFiles) * 100;
                                    progressFill.style.width = overallProgress + '%';
                                    progressText.textContent = `上传中（原始画质）... ${completedCount}/${totalFiles} (${file.name.substring(0, 20)}...) ${Math.round(fileProgress)}%`;
                                }
                            };
                            reader.readAsDataURL(file);
                        });
                        fileMimeType = file.type; // 保持原始格式
                        console.log(`视频直接读取完成（原始画质和音频）: ${file.name}, 大小: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
                    }
                    
                    // 确保fileUrl存在
                    if (!fileUrl) {
                        throw new Error('文件处理失败，未生成URL');
                    }
                    
                    // 确定文件类型
                    let mediaType = 'file';
                    if (file.type.startsWith('image/')) {
                        mediaType = 'image';
                    } else if (file.type.startsWith('video/')) {
                        mediaType = 'video';
                    } else if (file.type.includes('powerpoint') || file.type.includes('presentation')) {
                        mediaType = 'ppt';
                    } else if (file.type.includes('pdf')) {
                        mediaType = 'pdf';
                    }

                    const mediaItem = {
                        type: mediaType,
                        url: fileUrl,
                        name: file.name,
                        mimeType: fileMimeType || file.type,
                        size: file.size,
                        uploadTime: new Date().toISOString()
                    };

                    console.log('保存媒体项:', {
                        type: mediaItem.type,
                        name: mediaItem.name,
                        mimeType: mediaItem.mimeType,
                        urlLength: mediaItem.url ? mediaItem.url.length : 0,
                        urlPreview: mediaItem.url ? mediaItem.url.substring(0, 50) + '...' : 'null'
                    });

                    // 重新获取最新的媒体数组（防止并发问题）
                    mediaArray = await getProjectMedia(currentProjectId);

                    // 保存文件
                    mediaArray.push(mediaItem);
                    const saveResult = await saveProjectMedia(currentProjectId, mediaArray);
                    
                    completedCount++;
                    console.log(`文件 ${completedCount}/${totalFiles} 上传完成: ${file.name}`, {
                        type: mediaItem.type,
                        mimeType: mediaItem.mimeType,
                        urlLength: mediaItem.url ? mediaItem.url.length : 0,
                        saveResult: saveResult
                    });
                    
                    // 立即刷新显示（每个文件上传完成后）
                    loadProjectMedia(currentProjectId).catch(err => console.error('刷新显示失败:', err));
                    
                    // 更新项目封面
                    updateProjectCover(currentProjectId).catch(err => console.error('更新封面失败:', err));
                    
                    // 更新进度
                    updateProgress(completedCount, totalFiles);
                    
                    // 检查是否全部完成
                    checkAllCompleted().catch(err => console.error('检查完成状态失败:', err));
                } catch (error) {
                    console.error(`处理文件 "${file.name}" 时出错:`, error);
                    alert(`文件 "${file.name}" 处理失败：${error.message}`);
                    errorCount++;
                    completedCount++;
                    checkAllCompleted().catch(err => console.error('检查完成状态失败:', err));
                }
            })();
        }
    } catch (error) {
        console.error('上传过程中发生错误:', error);
        alert(`上传失败：${error.message}`);
        progressText.textContent = `上传失败：${error.message}`;
        setTimeout(() => {
            finishUpload();
        }, 3000);
    }
    
    function updateProgress(completed, total) {
        const progress = Math.min((completed / total) * 100, 100);
        progressFill.style.width = progress + '%';
        progressText.textContent = `上传中... ${completed}/${total}`;
    }
    
    async function checkAllCompleted() {
        if (completedCount >= totalFiles) {
            // 所有文件处理完成
            if (errorCount < totalFiles) {
                // 至少有一个文件成功，保存数据
                try {
                    await saveProjectMedia(currentProjectId, mediaArray);
                    await loadProjectMedia(currentProjectId);
                    // 更新项目封面
                    await updateProjectCover(currentProjectId);
                    
                    // 检查是否在项目详情页面，如果是，更新背景图
                    if (window.location.pathname.includes('project.html')) {
                        console.log('在项目详情页面，更新背景图');
                        // 重新设置项目详情页面的背景图
                        const projectHeader = document.querySelector('.project-header');
                        if (projectHeader) {
                            const mediaArray = await getProjectMedia(currentProjectId);
                            const firstImage = mediaArray.find(m => m.type === 'image' && m.url);
                            
                            if (firstImage) {
                                // 使用已上传的图片作为背景
                                projectHeader.style.background = `linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.5)), url('${firstImage.url}')`;
                                projectHeader.style.backgroundSize = 'cover';
                                projectHeader.style.backgroundPosition = 'center';
                                projectHeader.style.backgroundRepeat = 'no-repeat';
                                console.log('已更新项目详情页面背景图');
                            }
                        }
                    }
                    
                    console.log('所有文件上传完成，已保存');
                } catch (err) {
                    console.error('保存或加载失败:', err);
                }
            }
            
            // 显示完成消息
            if (errorCount === 0) {
                progressText.textContent = `上传完成！成功上传 ${totalFiles} 个文件`;
            } else if (errorCount === totalFiles) {
                progressText.textContent = '上传失败，请重试';
            } else {
                progressText.textContent = `上传完成！成功 ${totalFiles - errorCount} 个，失败 ${errorCount} 个`;
            }
            
            // 延迟隐藏进度条
            setTimeout(() => {
                finishUpload();
            }, 1500);
        }
    }
    
    function finishUpload() {
        uploadProgress.style.display = 'none';
        progressFill.style.width = '0%';
        progressText.textContent = '上传中...';
        // 清空文件输入，允许再次选择相同文件
        if (fileInputElement) {
            fileInputElement.value = '';
        }
    }
}

// 初始化项目模态框的事件监听（只在主页面时初始化）
function initProjectModalEventListeners() {
    // 使用事件委托处理项目按钮点击，减少事件监听器数量
    const handleClick = (e) => {
        // 处理项目按钮点击
        if (e.target.classList.contains('project-btn') || e.target.closest('.project-btn')) {
            const btn = e.target.closest('.project-btn');
            const projectId = btn.getAttribute('data-project-id');
            if (projectId) {
                console.log('点击了查看详情按钮，项目ID:', projectId);
                openModal(projectId);
            }
        }
        
        // 处理模态框关闭按钮点击
        if (e.target.classList.contains('modal-close') || e.target.closest('.modal-close')) {
            closeModal();
        }
        
        // 处理上传按钮点击
        if (e.target.id === 'uploadBtn' || e.target.closest('#uploadBtn')) {
            const fileInput = document.getElementById('fileInput');
            if (fileInput) {
                fileInput.click();
            }
        }
        
        // 处理上传区域点击
        if (e.target.id === 'uploadArea' || e.target.closest('#uploadArea')) {
            const fileInput = document.getElementById('fileInput');
            if (fileInput) {
                fileInput.click();
            }
        }
    };

    // 确保只添加一次事件监听器
    if (!window.projectModalEventListenersAdded) {
        document.addEventListener('click', handleClick);
        window.projectModalEventListenersAdded = true;
        console.log('项目模态框事件监听器已添加');
    }

    // 处理模态框外部点击关闭
    const modal = document.getElementById('projectModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }
    
    // ESC键关闭
    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('projectModal');
        if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
            closeModal();
        }
    });

    // 文件输入变化（使用事件委托）
    document.addEventListener('change', (e) => {
        if (e.target.id === 'fileInput') {
            const files = e.target.files;
            if (files && files.length > 0) {
                console.log('文件选择:', files.length, '个文件');
                uploadFiles(files);
            } else {
                console.log('未选择文件');
            }
        }
    });

    // 拖拽上传（使用事件委托）
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const uploadArea = document.getElementById('uploadArea');
        if (uploadArea && (e.target === uploadArea || uploadArea.contains(e.target))) {
            uploadArea.classList.add('dragover');
        }
    });

    document.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const uploadArea = document.getElementById('uploadArea');
        if (uploadArea && (e.target === uploadArea || uploadArea.contains(e.target))) {
            uploadArea.classList.remove('dragover');
        }
    });

    document.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const uploadArea = document.getElementById('uploadArea');
        if (uploadArea && (e.target === uploadArea || uploadArea.contains(e.target))) {
            uploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                console.log('拖拽文件:', files.length, '个文件');
                uploadFiles(files);
            }
        }
    });
    
    // 防止页面默认的拖拽行为
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    
    document.addEventListener('drop', (e) => {
        e.preventDefault();
    });
}

// 从视频 URL 随机截取一帧，返回 base64 图片（用于封面）
function captureVideoFrameAsImage(videoUrl) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        if (videoUrl.startsWith('http')) video.setAttribute('crossOrigin', 'anonymous');
        video.preload = 'metadata';

        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('视频加载超时'));
        }, 15000);

        function cleanup() {
            clearTimeout(timeout);
            video.removeEventListener('loadedmetadata', onMeta);
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);
            video.src = '';
            video.load();
        }

        function onError(e) {
            cleanup();
            reject(e);
        }

        function onMeta() {
            const duration = video.duration;
            if (!isFinite(duration) || duration <= 0) {
                video.currentTime = 0.5;
            } else {
                const maxTime = Math.max(0.5, duration - 0.5);
                const minTime = Math.min(0.5, duration * 0.1);
                const randomTime = minTime + Math.random() * (maxTime - minTime);
                video.currentTime = randomTime;
            }
        }

        function onSeeked() {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                if (canvas.width === 0 || canvas.height === 0) {
                    cleanup();
                    reject(new Error('视频尺寸无效'));
                    return;
                }
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                cleanup();
                resolve(dataUrl);
            } catch (err) {
                cleanup();
                reject(err);
            }
        }

        video.addEventListener('loadedmetadata', onMeta);
        video.addEventListener('seeked', onSeeked);
        video.addEventListener('error', onError);
        video.src = videoUrl;
        video.load();
    });
}

// 获取项目封面：优先第一张图片，否则从第一个视频随机截取一帧
async function getProjectCoverUrl(mediaArray) {
    const firstImage = mediaArray.find(m => m.type === 'image');
    if (firstImage && firstImage.url) return firstImage.url;

    const firstVideo = mediaArray.find(m => m.type === 'video');
    if (firstVideo && firstVideo.url) {
        try {
            return await captureVideoFrameAsImage(firstVideo.url);
        } catch (e) {
            console.warn('视频截帧失败，跳过封面:', e);
            return null;
        }
    }
    return null;
}

// 加载项目封面（图片或视频随机一帧）
async function loadProjectCovers() {
    const projectCards = document.querySelectorAll('.project-card');

    for (const card of projectCards) {
        const projectBtn = card.querySelector('.project-btn');
        if (!projectBtn) continue;

        const projectId = projectBtn.getAttribute('data-project-id');
        if (!projectId) continue;

        const projectImage = card.querySelector('.project-image');
        if (!projectImage) continue;

        try {
            const mediaArray = await getProjectMedia(projectId);
            const coverUrl = await getProjectCoverUrl(mediaArray);

            if (coverUrl) {
                const emoji = projectImage.querySelector('.project-emoji');
                let coverImg = projectImage.querySelector('img.project-cover-img');

                if (!coverImg) {
                    coverImg = document.createElement('img');
                    coverImg.className = 'project-cover-img';
                    coverImg.alt = (projectData[projectId] && projectData[projectId].title) ? projectData[projectId].title : '作品封面';
                    projectImage.insertBefore(coverImg, projectImage.firstChild);
                }

                coverImg.src = coverUrl;

                coverImg.onerror = function() {
                    if (emoji) emoji.style.display = '';
                    coverImg.style.display = 'none';
                };
                coverImg.onload = function() {
                    if (emoji) emoji.style.display = 'none';
                    coverImg.style.display = 'block';
                };

                if (emoji) emoji.style.display = 'none';
                coverImg.style.display = 'block';
            }
        } catch (error) {
            console.error(`加载项目封面失败 ${projectId}:`, error);
        }
    }
}

// 当媒体文件上传后，更新项目封面（图片或视频随机一帧）
async function updateProjectCover(projectId) {
    const projectCards = document.querySelectorAll('.project-card');

    for (const card of projectCards) {
        const projectBtn = card.querySelector('.project-btn');
        if (!projectBtn || projectBtn.getAttribute('data-project-id') !== projectId) continue;

        const projectImage = card.querySelector('.project-image');
        if (!projectImage) continue;

        try {
            const mediaArray = await getProjectMedia(projectId);
            const coverUrl = await getProjectCoverUrl(mediaArray);
            const emoji = projectImage.querySelector('.project-emoji');

            if (coverUrl) {
                let coverImg = projectImage.querySelector('img.project-cover-img');
                if (!coverImg) {
                    coverImg = document.createElement('img');
                    coverImg.className = 'project-cover-img';
                    coverImg.alt = (projectData[projectId] && projectData[projectId].title) ? projectData[projectId].title : '作品封面';
                    projectImage.insertBefore(coverImg, projectImage.firstChild);
                }
                coverImg.src = coverUrl;
                coverImg.onerror = function() {
                    if (emoji) emoji.style.display = '';
                    coverImg.style.display = 'none';
                };
                coverImg.onload = function() {
                    if (emoji) emoji.style.display = 'none';
                    coverImg.style.display = 'block';
                };
                if (emoji) emoji.style.display = 'none';
                coverImg.style.display = 'block';
            } else {
                const coverImg = projectImage.querySelector('img.project-cover-img');
                if (coverImg) coverImg.style.display = 'none';
                if (emoji) emoji.style.display = '';
            }
        } catch (error) {
            console.error(`更新项目封面失败 ${projectId}:`, error);
        }
        break;
    }
}


// 导航栏滚动效果（虽然现在是分页，但保留以防需要）
let lastScroll = 0;
const navbar = document.querySelector('.navbar');

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    if (currentScroll > 50) {
        navbar.style.boxShadow = '0 4px 16px rgba(78, 205, 196, 0.2)';
    } else {
        navbar.style.boxShadow = '0 2px 8px rgba(78, 205, 196, 0.15)';
    }
    
    lastScroll = currentScroll;
});

// 工作经验管理功能
let experiences = [];

// 加载工作经验
function loadExperiences() {
    try {
        const saved = localStorage.getItem('experiences');
        if (saved) {
            experiences = JSON.parse(saved);
        } else {
            // 初始化默认工作经验
            experiences = [
                {
                    date: '2025.05 - 2025.09',
                    company: '杭州鼎文学校',
                    position: '内容编导',
                    description: '负责学校品牌宣传视频的策划与编导，从选题、脚本撰写到拍摄现场调度全流程参与；协调摄像与后期团队，把控成片节奏与风格；产出多条招生宣传片及活动纪实视频，用于官网与社交媒体投放。'
                },
                {
                    date: '2024.09 - 2025.01',
                    company: '苹果有限公司',
                    position: '校园大使（用户运营）',
                    description: '在高校内开展苹果产品体验与用户运营，策划并执行线下体验活动、工作坊；负责校园社群维护与内容输出，收集用户反馈并配合品牌活动落地；协助新品推广与校园渠道拓展。'
                },
                {
                    date: '2024.06 - 2024.09',
                    company: '漳州市应急管理局',
                    position: '内容运营',
                    description: '参与应急科普与政务新媒体内容策划与制作，撰写安全知识、政策解读等推文与短视频脚本；配合防灾减灾宣传节点产出图文与视频内容，提升公众号与短视频账号的传播与互动效果。'
                },
                {
                    date: '2023.03 - 2023.12',
                    company: '浩静花园（上海）文化有限公司',
                    position: '新媒体运营',
                    description: '独立负责公司多平台新媒体账号的日常运营，包括公众号、小红书、抖音等；完成选题策划、文案撰写、图片与短视频拍摄剪辑及发布；通过数据分析优化内容与发布节奏，参与品牌活动与直播策划执行。'
                }
            ];
            saveExperiences();
        }
        // 按时间排序并渲染
        sortExperiences();
        renderExperiences();
    } catch (error) {
        console.error('加载工作经验失败:', error);
    }
}

// 保存工作经验
function saveExperiences() {
    try {
        localStorage.setItem('experiences', JSON.stringify(experiences));
    } catch (error) {
        console.error('保存工作经验失败:', error);
    }
}

// 解析日期范围为时间戳（用于排序）
function parseDateRange(dateStr) {
    const parts = dateStr.split(' - ');
    if (parts.length === 2) {
        const startDate = parts[0].trim();
        const endDate = parts[1].trim();
        
        // 解析开始日期
        const startParts = startDate.split('.');
        if (startParts.length === 2) {
            const startYear = parseInt(startParts[0]);
            const startMonth = parseInt(startParts[1]);
            return new Date(startYear, startMonth - 1, 1).getTime();
        }
    }
    return Date.now();
}

// 按时间排序工作经验（最新的在前）
function sortExperiences() {
    experiences.sort((a, b) => {
        return parseDateRange(b.date) - parseDateRange(a.date);
    });
}

// 渲染工作经验
function renderExperiences() {
    const timeline = document.querySelector('.timeline');
    if (!timeline) return;
    
    // 清空现有的工作经验（保留结构）
    timeline.innerHTML = '';
    
    // 添加排序后的工作经验
        experiences.forEach((exp, index) => {
            const experienceItem = document.createElement('div');
            experienceItem.className = 'timeline-item';
            
            // 根据登录状态决定是否显示编辑按钮
            let buttonsHtml = '';
            if (isLoggedIn) {
                buttonsHtml = `
                    <div style="display: flex; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap;">
                        ${index > 0 ? `<button class="btn" style="padding: 0.5rem 1rem; font-size: 0.8rem; background: var(--primary-blue); color: white;" onclick="moveExperienceUp(${index})">↑ 上移</button>` : ''}
                        ${index < experiences.length - 1 ? `<button class="btn" style="padding: 0.5rem 1rem; font-size: 0.8rem; background: var(--primary-blue); color: white;" onclick="moveExperienceDown(${index})">↓ 下移</button>` : ''}
                        <button class="btn btn-primary" style="padding: 0.5rem 1rem; font-size: 0.8rem;" onclick="editExperience(${index})">✏️ 编辑</button>
                        <button class="btn" style="padding: 0.5rem 1rem; font-size: 0.8rem; background: #FF6B6B; color: white;" onclick="deleteExperience(${index})">🗑️ 删除</button>
                    </div>
                `;
            }
            
            experienceItem.innerHTML = `
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                    <div class="timeline-date">${exp.date}</div>
                    <div class="timeline-company">${exp.company}</div>
                    <div class="timeline-position">${exp.position}</div>
                    <p class="timeline-description">${exp.description}</p>
                    ${buttonsHtml}
                </div>
            `;
            timeline.appendChild(experienceItem);
        });
}

// 打开添加工作经验模态框
function openExperienceModal() {
    // 检查登录状态
    if (!isLoggedIn) {
        alert('请先登录后再添加或编辑工作经验！');
        return;
    }
    
    const modal = document.getElementById('experienceModal');
    if (modal) {
        modal.classList.add('active');
    }
}

// 关闭添加工作经验模态框
function closeExperienceModal() {
    const modal = document.getElementById('experienceModal');
    if (modal) {
        modal.classList.remove('active');
    }
    // 重置表单
    const form = document.getElementById('experienceForm');
    if (form) {
        form.reset();
    }
}

// 添加工作经验
function addExperience(experience) {
    // 检查登录状态
    if (!isLoggedIn) {
        alert('请先登录后再添加工作经验！');
        return;
    }
    
    experiences.push(experience);
    sortExperiences();
    saveExperiences();
    renderExperiences();
    closeExperienceModal();
    alert('工作经验添加成功！🎉');
}

// 编辑工作经验
function editExperience(index) {
    // 检查登录状态
    if (!isLoggedIn) {
        alert('请先登录后再编辑工作经验！');
        return;
    }
    
    const exp = experiences[index];
    if (!exp) return;
    
    // 填充表单
    document.getElementById('experienceDate').value = exp.date;
    document.getElementById('experienceCompany').value = exp.company;
    document.getElementById('experiencePosition').value = exp.position;
    document.getElementById('experienceDescription').value = exp.description;
    
    // 打开模态框
    openExperienceModal();
    
    // 标记为编辑模式
    window.editingExperienceIndex = index;
}

// 删除工作经验
function deleteExperience(index) {
    // 检查登录状态
    if (!isLoggedIn) {
        alert('请先登录后再删除工作经验！');
        return;
    }
    
    if (confirm('确定要删除这个工作经验吗？')) {
        experiences.splice(index, 1);
        saveExperiences();
        renderExperiences();
        alert('工作经验删除成功！🗑️');
    }
}

// 上移工作经验
function moveExperienceUp(index) {
    // 检查登录状态
    if (!isLoggedIn) {
        alert('请先登录后再调整工作经验顺序！');
        return;
    }
    
    if (index > 0) {
        // 交换位置
        const temp = experiences[index];
        experiences[index] = experiences[index - 1];
        experiences[index - 1] = temp;
        
        // 保存并重新渲染
        saveExperiences();
        renderExperiences();
        alert('工作经验已上移！↑');
    }
}

// 下移工作经验
function moveExperienceDown(index) {
    // 检查登录状态
    if (!isLoggedIn) {
        alert('请先登录后再调整工作经验顺序！');
        return;
    }
    
    if (index < experiences.length - 1) {
        // 交换位置
        const temp = experiences[index];
        experiences[index] = experiences[index + 1];
        experiences[index + 1] = temp;
        
        // 保存并重新渲染
        saveExperiences();
        renderExperiences();
        alert('工作经验已下移！↓');
    }
}

// 加载个人照片
function loadProfilePhoto() {
    try {
        const savedPhoto = localStorage.getItem('profilePhoto');
        if (savedPhoto) {
            const profilePhoto = document.getElementById('profilePhoto');
            const photoPlaceholder = document.getElementById('photoPlaceholder');
            
            if (profilePhoto && photoPlaceholder) {
                profilePhoto.src = savedPhoto;
                profilePhoto.style.display = 'block';
                photoPlaceholder.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('加载个人照片失败:', error);
    }
}

// 加载关于我页面的保存数据
function loadAboutData() {
    try {
        const aboutSection = document.getElementById('about');
        if (!aboutSection) return;
        
        // 可编辑元素选择器
        const editableSelectors = [
            '.about-name',
            '.about-subtitle',
            '.about-description',
            '.stat-number',
            '.stat-label',
            '.timeline-title',
            '.timeline-date',
            '.timeline-company',
            '.timeline-position',
            '.timeline-description'
        ];
        
        editableSelectors.forEach(selector => {
            const elements = aboutSection.querySelectorAll(selector);
            elements.forEach((element, index) => {
                // 从localStorage加载保存的数据
                const key = `about_${selector.replace('.', '')}_${index}`;
                const savedText = localStorage.getItem(key);
                if (savedText) {
                    // 保存编辑按钮
                    const editButton = element.querySelector('.edit-text-btn');
                    
                    // 清空元素内容
                    element.innerHTML = '';
                    
                    // 创建新的文本节点
                    const textNode = document.createTextNode(savedText);
                    element.appendChild(textNode);
                    
                    // 重新添加编辑按钮
                    if (editButton) {
                        element.appendChild(editButton);
                    }
                }
            });
        });
    } catch (error) {
        console.error('加载关于我页面数据失败:', error);
    }
}

// 保存个人照片
function saveProfilePhoto(photoData) {
    try {
        localStorage.setItem('profilePhoto', photoData);
        loadProfilePhoto();
        alert('照片上传成功！📷');
    } catch (error) {
        console.error('保存个人照片失败:', error);
        alert('照片上传失败，请重试');
    }
}

// 压缩图片
function compressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = function() {
            let width = img.width;
            let height = img.height;
            
            if (width > height) {
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = (width * maxHeight) / height;
                    height = maxHeight;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            
            ctx.drawImage(img, 0, 0, width, height);
            
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        const reader = new FileReader();
                        reader.onloadend = function() {
                            resolve(reader.result);
                        };
                        reader.readAsDataURL(blob);
                    } else {
                        reject(new Error('压缩失败'));
                    }
                },
                'image/jpeg',
                quality
            );
        };
        
        img.onerror = function() {
            reject(new Error('图片加载失败'));
        };
        
        img.src = URL.createObjectURL(file);
    });
}

// 添加页面切换时的特殊效果
document.addEventListener('DOMContentLoaded', () => {
    // 为每个页面添加进入动画
    const pages = document.querySelectorAll('.page');
    pages.forEach((page, index) => {
        page.style.animationDelay = `${index * 0.1}s`;
    });
    
    // 加载工作经验
    loadExperiences();
    
    // 加载个人照片
    loadProfilePhoto();
    
    // 加载关于我页面的保存数据
    loadAboutData();
    
    // 绑定添加工作经验按钮事件
    const addBtn = document.getElementById('addExperienceBtn');
    if (addBtn) {
        addBtn.addEventListener('click', openExperienceModal);
    }
    
    // 绑定工作经验模态框关闭事件
    const modalClose = document.querySelector('#experienceModal .modal-close');
    if (modalClose) {
        modalClose.addEventListener('click', closeExperienceModal);
    }
    
    // 绑定工作经验表单提交事件
    const experienceForm = document.getElementById('experienceForm');
    if (experienceForm) {
        experienceForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // 检查登录状态
            if (!isLoggedIn) {
                alert('请先登录后再添加或编辑工作经验！');
                closeExperienceModal();
                return;
            }
            
            const date = document.getElementById('experienceDate').value;
            const company = document.getElementById('experienceCompany').value;
            const position = document.getElementById('experiencePosition').value;
            const description = document.getElementById('experienceDescription').value;
            
            const experience = {
                date,
                company,
                position,
                description
            };
            
            if (window.editingExperienceIndex !== undefined) {
                // 编辑现有经验
                experiences[window.editingExperienceIndex] = experience;
                window.editingExperienceIndex = undefined;
                sortExperiences();
                saveExperiences();
                renderExperiences();
                closeExperienceModal();
                alert('工作经验编辑成功！✏️');
            } else {
                // 添加新经验
                addExperience(experience);
            }
        });
    }
    
    // 点击模态框外部关闭
    const experienceModal = document.getElementById('experienceModal');
    if (experienceModal) {
        experienceModal.addEventListener('click', (e) => {
            if (e.target === experienceModal) {
                closeExperienceModal();
            }
        });
    }
    
    // 绑定个人照片上传事件
    const photoUpload = document.getElementById('photoUpload');
    const aboutPhoto = document.querySelector('.about-photo');
    const photoPlaceholder = document.getElementById('photoPlaceholder');
    
    if (photoUpload && aboutPhoto) {
        // 点击照片区域触发上传
        aboutPhoto.addEventListener('click', (e) => {
            if (e.target === aboutPhoto || e.target === photoPlaceholder || e.target.closest('.photo-upload-overlay')) {
                // 检查登录状态
                if (!isLoggedIn) {
                    alert('请先登录后再更改照片！');
                    return;
                }
                photoUpload.click();
            }
        });
        
        // 处理文件选择
        photoUpload.addEventListener('change', async (e) => {
            // 检查登录状态
            if (!isLoggedIn) {
                alert('请先登录后再更改照片！');
                photoUpload.value = '';
                return;
            }
            
            const files = e.target.files;
            if (files && files.length > 0) {
                const file = files[0];
                
                if (file.type.startsWith('image/')) {
                    try {
                        // 压缩图片
                        const compressedData = await compressImage(file);
                        // 保存照片
                        saveProfilePhoto(compressedData);
                    } catch (error) {
                        console.error('照片处理失败:', error);
                        alert('照片处理失败，请重试');
                    }
                } else {
                    alert('请选择图片文件');
                }
                
                // 清空文件输入，允许再次选择相同文件
                photoUpload.value = '';
            }
        });
    }
    
    // 加载二维码
    function loadQrCode() {
        try {
            const savedQr = localStorage.getItem('qrCode');
            if (savedQr) {
                const qrCode = document.getElementById('qrCode');
                const qrPlaceholder = document.getElementById('qrPlaceholder');
                const qrContainer = document.getElementById('qrContainer');
                
                if (qrCode && qrPlaceholder && qrContainer) {
                    qrCode.src = savedQr;
                    qrCode.style.display = 'block';
                    qrPlaceholder.style.display = 'none';
                    
                    // 等待图片加载完成后调整容器大小
                    qrCode.onload = function() {
                        // 获取图片的实际尺寸
                        const imgWidth = qrCode.naturalWidth;
                        const imgHeight = qrCode.naturalHeight;
                        
                        // 设置最大尺寸
                        const maxSize = 250;
                        let displayWidth = imgWidth;
                        let displayHeight = imgHeight;
                        
                        // 如果图片尺寸超过最大尺寸，按比例缩放
                        if (imgWidth > maxSize || imgHeight > maxSize) {
                            const ratio = Math.min(maxSize / imgWidth, maxSize / imgHeight);
                            displayWidth = Math.floor(imgWidth * ratio);
                            displayHeight = Math.floor(imgHeight * ratio);
                        }
                        
                        // 调整二维码容器的大小以匹配图片大小（限制在最大尺寸内）
                        qrContainer.style.width = `${displayWidth}px`;
                        qrContainer.style.height = `${displayHeight}px`;
                    };
                }
            }
        } catch (error) {
            console.error('加载二维码失败:', error);
        }
    }
    
    // 保存二维码
    function saveQrCode(qrData) {
        try {
            localStorage.setItem('qrCode', qrData);
            loadQrCode();
            alert('二维码上传成功！📱');
        } catch (error) {
            console.error('保存二维码失败:', error);
            alert('二维码上传失败，请重试');
        }
    }
    
    // 加载联系文字
    function loadContactText() {
        try {
            const savedText = localStorage.getItem('contactText');
            const contactText = document.getElementById('contactText');
            if (contactText) {
                if (savedText) {
                    contactText.textContent = savedText;
                } else {
                    // 默认文字
                    const defaultText = '如果你对我的作品感兴趣，或者想要合作，欢迎随时联系我。';
                    contactText.textContent = defaultText;
                    localStorage.setItem('contactText', defaultText);
                }
            }
        } catch (error) {
            console.error('加载联系文字失败:', error);
        }
    }
    
    // 保存联系文字
    function saveContactText(text) {
        try {
            localStorage.setItem('contactText', text);
            const contactText = document.getElementById('contactText');
            if (contactText) {
                contactText.textContent = text;
            }
            alert('联系文字保存成功！✏️');
        } catch (error) {
            console.error('保存联系文字失败:', error);
            alert('联系文字保存失败，请重试');
        }
    }
    
    // 打开编辑联系文字模态框
    function openContactTextModal() {
        // 检查登录状态
        if (!isLoggedIn) {
            alert('请先登录后再编辑联系文字！');
            return;
        }
        
        const modal = document.getElementById('contactTextModal');
        const contactText = document.getElementById('contactText');
        const contactTextInput = document.getElementById('contactTextInput');
        
        if (modal && contactText && contactTextInput) {
            contactTextInput.value = contactText.textContent;
            modal.classList.add('active');
        }
    }
    
    // 关闭编辑联系文字模态框
    function closeContactTextModal() {
        const modal = document.getElementById('contactTextModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }
    
    // 加载二维码和联系文字
    loadQrCode();
    loadContactText();
    
    // 绑定二维码上传事件
    const qrUpload = document.getElementById('qrUpload');
    const uploadQrBtn = document.getElementById('uploadQrBtn');
    const qrContainer = document.getElementById('qrContainer');
    const qrPlaceholder = document.getElementById('qrPlaceholder');
    
    if (qrUpload && uploadQrBtn) {
        // 点击上传按钮触发上传
        uploadQrBtn.addEventListener('click', () => {
            // 检查登录状态
            if (!isLoggedIn) {
                alert('请先登录后再上传二维码！');
                return;
            }
            qrUpload.click();
        });
        
        // 点击二维码区域触发上传
        if (qrContainer) {
            qrContainer.addEventListener('click', (e) => {
                // 检查登录状态
                if (!isLoggedIn) {
                    alert('请先登录后再上传二维码！');
                    return;
                }
                if (e.target === qrContainer || e.target === qrPlaceholder) {
                    qrUpload.click();
                }
            });
        }
        
        // 处理文件选择
        qrUpload.addEventListener('change', async (e) => {
            // 检查登录状态
            if (!isLoggedIn) {
                alert('请先登录后再上传二维码！');
                qrUpload.value = '';
                return;
            }
            
            const files = e.target.files;
            if (files && files.length > 0) {
                const file = files[0];
                
                if (file.type.startsWith('image/')) {
                    try {
                        // 压缩图片
                        const compressedData = await compressImage(file);
                        // 保存二维码
                        saveQrCode(compressedData);
                    } catch (error) {
                        console.error('二维码处理失败:', error);
                        alert('二维码处理失败，请重试');
                    }
                } else {
                    alert('请选择图片文件');
                }
                
                // 清空文件输入，允许再次选择相同文件
                qrUpload.value = '';
            }
        });
    }
    
    // 绑定编辑联系文字按钮事件
    const editContactTextBtn = document.getElementById('editContactTextBtn');
    if (editContactTextBtn) {
        editContactTextBtn.addEventListener('click', openContactTextModal);
    }
    
    // 绑定联系文字模态框关闭事件
    const contactTextModalClose = document.querySelector('#contactTextModal .modal-close');
    if (contactTextModalClose) {
        contactTextModalClose.addEventListener('click', closeContactTextModal);
    }
    
    // 绑定联系文字表单提交事件
    const contactTextForm = document.getElementById('contactTextForm');
    if (contactTextForm) {
        contactTextForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const contactTextInput = document.getElementById('contactTextInput');
            if (contactTextInput) {
                const text = contactTextInput.value;
                saveContactText(text);
                closeContactTextModal();
            }
        });
    }
    
    // 点击联系文字模态框外部关闭
    const contactTextModal = document.getElementById('contactTextModal');
    if (contactTextModal) {
        contactTextModal.addEventListener('click', (e) => {
            if (e.target === contactTextModal) {
                closeContactTextModal();
            }
        });
    }



    // 拖拽调整作品卡片顺序功能
    const projectsGrid = document.getElementById('projectsGrid');
    let draggedElement = null;
    
    // 加载保存的作品顺序
    function loadProjectOrder() {
        try {
            const savedOrder = localStorage.getItem('projectOrder');
            if (savedOrder) {
                return JSON.parse(savedOrder);
            }
        } catch (error) {
            console.error('加载作品顺序失败:', error);
        }
        return null;
    }
    
    // 保存作品顺序
    function saveProjectOrder() {
        try {
            const projectCards = projectsGrid.querySelectorAll('.project-card');
            const order = Array.from(projectCards).map(card => {
                // 使用卡片标题作为唯一标识
                return card.querySelector('.project-title').textContent;
            });
            localStorage.setItem('projectOrder', JSON.stringify(order));
        } catch (error) {
            console.error('保存作品顺序失败:', error);
        }
    }
    
    // 应用保存的作品顺序
    function applyProjectOrder() {
        const savedOrder = loadProjectOrder();
        if (savedOrder && projectsGrid) {
            const projectCards = projectsGrid.querySelectorAll('.project-card');
            const cardMap = new Map();
            
            // 创建卡片标题到卡片元素的映射
            projectCards.forEach(card => {
                const title = card.querySelector('.project-title').textContent;
                cardMap.set(title, card);
            });
            
            // 按照保存的顺序重新排列卡片
            savedOrder.forEach(title => {
                const card = cardMap.get(title);
                if (card) {
                    projectsGrid.appendChild(card);
                }
            });
        }
    }
    
    if (projectsGrid) {
        // 应用保存的作品顺序
        applyProjectOrder();
        
        // 为所有卡片添加拖拽事件监听器
        function addDragListeners() {
            const projectCards = projectsGrid.querySelectorAll('.project-card');
            projectCards.forEach(card => {
                // 确保卡片有唯一标识
                if (!card.getAttribute('data-index')) {
                    card.setAttribute('data-index', Array.from(projectCards).indexOf(card));
                }
                
                // 根据登录状态设置是否可拖拽
                card.setAttribute('draggable', isLoggedIn);
                
                card.addEventListener('dragstart', (e) => {
                    if (!isLoggedIn) {
                        e.preventDefault();
                        return;
                    }
                    draggedElement = card;
                    setTimeout(() => {
                        card.style.opacity = '0.5';
                    }, 0);
                });
                
                // 添加拖拽结束事件
                card.addEventListener('dragend', (e) => {
                    card.style.opacity = '1';
                    draggedElement = null;
                });
                
                // 添加拖拽经过事件
                card.addEventListener('dragover', (e) => {
                    if (!isLoggedIn) {
                        return;
                    }
                    e.preventDefault();
                });
                
                // 添加拖拽进入事件
                card.addEventListener('dragenter', (e) => {
                    if (!isLoggedIn) {
                        return;
                    }
                    e.preventDefault();
                    if (card !== draggedElement) {
                        card.style.transform = 'scale(1.05)';
                        card.style.transition = 'transform 0.2s ease';
                    }
                });
                
                // 添加拖拽离开事件
                card.addEventListener('dragleave', (e) => {
                    card.style.transform = '';
                });
                
                // 添加放置事件
                card.addEventListener('drop', (e) => {
                    if (!isLoggedIn) {
                        return;
                    }
                    e.preventDefault();
                    card.style.transform = '';
                    
                    if (card !== draggedElement) {
                        // 获取所有卡片
                        const cards = Array.from(projectsGrid.children);
                        const draggedIndex = cards.indexOf(draggedElement);
                        const dropIndex = cards.indexOf(card);
                        
                        // 重新排列卡片
                        if (draggedIndex < dropIndex) {
                            projectsGrid.insertBefore(draggedElement, card.nextSibling);
                        } else {
                            projectsGrid.insertBefore(draggedElement, card);
                        }
                        
                        // 重新设置索引
                        cards.forEach((c, index) => {
                            c.setAttribute('data-index', index);
                        });
                        
                        // 保存新的卡片顺序
                        saveProjectOrder();
                        
                        // 显示调整成功的提示
                        setTimeout(() => {
                            alert('作品卡片顺序已调整！🔄');
                        }, 500);
                    }
                });
            });
        }
        
        // 初始添加拖拽监听器
        addDragListeners();
        
        // 导出函数供其他模块使用
        window.addDragListeners = addDragListeners;
        window.applyProjectOrder = applyProjectOrder;
    }

    // 修改登录和登出函数，确保在登录和登出时更新卡片的拖拽属性
    function updateDragListeners() {
        if (typeof addDragListeners === 'function') {
            addDragListeners();
        }
    }

    // 技能管理功能
    let skills = [];
    let editingSkillIndex = undefined;

    // 加载技能数据
    function loadSkills() {
        try {
            const savedSkills = localStorage.getItem('skills');
            if (savedSkills) {
                skills = JSON.parse(savedSkills);
            } else {
                // 默认技能数据
                skills = [
                    { icon: '✂️', title: '视频剪辑', description: '剪映、PR、达芬奇', stars: 5 },
                    { icon: '🎨', title: '美编排版', description: 'PS、AI、ID、Canva', stars: 5 },
                    { icon: '🤖', title: 'AI技术应用', description: '可灵、即梦、豆包、通义、海螺、Sora', stars: 5 },
                    { icon: '📊', title: '数据分析', description: 'MySQL、数据运营分析', stars: 4 },
                    { icon: '📝', title: '内容运营', description: '公众号、视频号、社群运营', stars: 5 },
                    { icon: '💼', title: '办公软件', description: 'Word、Excel、PPT', stars: 5 }
                ];
                saveSkills();
            }
            renderSkills();
        } catch (error) {
            console.error('加载技能数据失败:', error);
        }
    }

    // 保存技能数据
    function saveSkills() {
        try {
            localStorage.setItem('skills', JSON.stringify(skills));
        } catch (error) {
            console.error('保存技能数据失败:', error);
        }
    }

    // 渲染技能卡片
    function renderSkills() {
        const skillsGrid = document.getElementById('skillsGrid');
        if (!skillsGrid) return;

        skillsGrid.innerHTML = '';

        skills.forEach((skill, index) => {
            const skillCard = document.createElement('div');
            skillCard.className = 'skill-card';
            skillCard.setAttribute('data-index', index);

            // 生成星级字符串
            let starsHtml = '';
            for (let i = 0; i < skill.stars; i++) {
                starsHtml += '⭐';
            }

            // 根据登录状态决定是否显示编辑删除按钮
            let buttonsHtml = '';
            if (isLoggedIn) {
                buttonsHtml = `
                    <div style="display: flex; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap;">
                        <button class="btn btn-primary" style="padding: 0.3rem 0.6rem; font-size: 0.7rem;" onclick="editSkill(${index})">✏️ 编辑</button>
                        <button class="btn" style="padding: 0.3rem 0.6rem; font-size: 0.7rem; background: #FF6B6B; color: white;" onclick="deleteSkill(${index})">🗑️ 删除</button>
                    </div>
                `;
            }

            skillCard.innerHTML = `
                <div class="skill-icon">${skill.icon}</div>
                <h3 class="skill-title">${skill.title}</h3>
                <p class="skill-description">${skill.description}</p>
                <div class="skill-stars">${starsHtml}</div>
                ${buttonsHtml}
            `;

            skillsGrid.appendChild(skillCard);
        });
    }

    // 打开添加技能模态框
    function openSkillModal() {
        const modal = document.getElementById('skillModal');
        const skillIcon = document.getElementById('skillIcon');
        const skillTitle = document.getElementById('skillTitle');
        const skillDescription = document.getElementById('skillDescription');
        const skillStars = document.getElementById('skillStars');

        if (modal && skillIcon && skillTitle && skillDescription && skillStars) {
            // 重置表单
            skillIcon.value = '';
            skillTitle.value = '';
            skillDescription.value = '';
            skillStars.value = '5';
            editingSkillIndex = undefined;
            modal.classList.add('active');
        }
    }

    // 关闭技能模态框
    function closeSkillModal() {
        const modal = document.getElementById('skillModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    // 编辑技能
    function editSkill(index) {
        const skill = skills[index];
        if (!skill) return;

        const modal = document.getElementById('skillModal');
        const skillIcon = document.getElementById('skillIcon');
        const skillTitle = document.getElementById('skillTitle');
        const skillDescription = document.getElementById('skillDescription');
        const skillStars = document.getElementById('skillStars');

        if (modal && skillIcon && skillTitle && skillDescription && skillStars) {
            // 填充表单
            skillIcon.value = skill.icon;
            skillTitle.value = skill.title;
            skillDescription.value = skill.description;
            skillStars.value = skill.stars;
            editingSkillIndex = index;
            modal.classList.add('active');
        }
    }

    // 删除技能
    function deleteSkill(index) {
        if (confirm('确定要删除这个技能吗？')) {
            skills.splice(index, 1);
            saveSkills();
            renderSkills();
            alert('技能删除成功！🗑️');
        }
    }

    // 添加技能
    function addSkill(skill) {
        skills.push(skill);
        saveSkills();
        renderSkills();
        closeSkillModal();
        alert('技能添加成功！🎉');
    }

    // 绑定添加技能按钮事件
    const addSkillBtn = document.getElementById('addSkillBtn');
    if (addSkillBtn) {
        addSkillBtn.addEventListener('click', openSkillModal);
    }

    // 绑定技能模态框关闭事件
    const skillModalClose = document.querySelector('#skillModal .modal-close');
    if (skillModalClose) {
        skillModalClose.addEventListener('click', closeSkillModal);
    }

    // 绑定技能表单提交事件
    const skillForm = document.getElementById('skillForm');
    if (skillForm) {
        skillForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const skillIcon = document.getElementById('skillIcon');
            const skillTitle = document.getElementById('skillTitle');
            const skillDescription = document.getElementById('skillDescription');
            const skillStars = document.getElementById('skillStars');

            if (skillIcon && skillTitle && skillDescription && skillStars) {
                const skill = {
                    icon: skillIcon.value,
                    title: skillTitle.value,
                    description: skillDescription.value,
                    stars: parseInt(skillStars.value)
                };

                if (editingSkillIndex !== undefined) {
                    // 编辑现有技能
                    skills[editingSkillIndex] = skill;
                    editingSkillIndex = undefined;
                    saveSkills();
                    renderSkills();
                    closeSkillModal();
                    alert('技能编辑成功！✏️');
                } else {
                    // 添加新技能
                    addSkill(skill);
                }
            }
        });
    }

    // 点击技能模态框外部关闭
    const skillModal = document.getElementById('skillModal');
    if (skillModal) {
        skillModal.addEventListener('click', (e) => {
            if (e.target === skillModal) {
                closeSkillModal();
            }
        });
    }

    // 导出技能管理函数供其他模块使用
    window.loadSkills = loadSkills;
    window.saveSkills = saveSkills;
    window.renderSkills = renderSkills;
    window.openSkillModal = openSkillModal;
    window.closeSkillModal = closeSkillModal;
    window.editSkill = editSkill;
    window.deleteSkill = deleteSkill;
    window.addSkill = addSkill;

    // 初始化技能数据
    loadSkills();

    // 编辑作品图标功能
    let editingEmojiElement = null;

    // 为作品卡片添加编辑图标按钮
    function addEmojiEditButtons() {
        const projectCards = document.querySelectorAll('.project-card');
        projectCards.forEach(card => {
            // 确保卡片有唯一标识
            if (!card.getAttribute('data-index')) {
                card.setAttribute('data-index', Array.from(projectCards).indexOf(card));
            }

            // 检查是否已经有编辑图标按钮
            if (!card.querySelector('.edit-emoji-btn')) {
                const editBtn = document.createElement('button');
                editBtn.className = 'edit-emoji-btn';
                editBtn.textContent = '✏️';
                editBtn.title = '编辑图标';
                editBtn.style.cssText = `
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    background: rgba(255, 255, 255, 0.9);
                    border: none;
                    border-radius: 50%;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    z-index: 10;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                    font-size: 12px;
                `;

                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // 检查登录状态
                    if (!isLoggedIn) {
                        alert('请先登录后再编辑作品图标！');
                        return;
                    }
                    const emojiElement = card.querySelector('.project-emoji');
                    if (emojiElement) {
                        openEmojiModal(emojiElement);
                    }
                });

                card.style.position = 'relative';
                card.appendChild(editBtn);
            }
        });
    }

    // 打开编辑作品图标模态框
    function openEmojiModal(emojiElement) {
        const modal = document.getElementById('emojiModal');
        const emojiInput = document.getElementById('emojiInput');

        if (modal && emojiInput) {
            editingEmojiElement = emojiElement;
            // 填充当前图标
            emojiInput.value = emojiElement.textContent;
            modal.classList.add('active');

            // 绑定常用图标点击事件
            const emojiOptions = document.querySelectorAll('.emoji-option');
            emojiOptions.forEach(option => {
                option.addEventListener('click', () => {
                    emojiInput.value = option.textContent;
                });
            });
        }
    }

    // 关闭编辑作品图标模态框
    function closeEmojiModal() {
        const modal = document.getElementById('emojiModal');
        if (modal) {
            modal.classList.remove('active');
            editingEmojiElement = null;
        }
    }

    // 保存作品图标
    function saveEmoji() {
        const emojiInput = document.getElementById('emojiInput');
        if (emojiInput && editingEmojiElement) {
            editingEmojiElement.textContent = emojiInput.value;
            closeEmojiModal();
            alert('作品图标更新成功！✨');
        }
    }

    // 绑定编辑作品图标模态框关闭事件
    const emojiModalClose = document.querySelector('#emojiModal .modal-close');
    if (emojiModalClose) {
        emojiModalClose.addEventListener('click', closeEmojiModal);
    }

    // 绑定编辑作品图标表单提交事件
    const emojiForm = document.getElementById('emojiForm');
    if (emojiForm) {
        emojiForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveEmoji();
        });
    }

    // 点击编辑作品图标模态框外部关闭
    const emojiModal = document.getElementById('emojiModal');
    if (emojiModal) {
        emojiModal.addEventListener('click', (e) => {
            if (e.target === emojiModal) {
                closeEmojiModal();
            }
        });
    }

    // 在登录时添加编辑图标按钮
    function addEmojiEditButtonsOnLogin() {
        if (isLoggedIn) {
            addEmojiEditButtons();
        }
    }

    // 修改登录函数，添加编辑图标按钮
    if (typeof updateUIForLogin === 'function') {
        const originalUpdateUIForLogin = updateUIForLogin;
        updateUIForLogin = function() {
            originalUpdateUIForLogin();
            addEmojiEditButtons();
        };
    }

    // 修改登出函数，移除编辑图标按钮
    if (typeof updateUIForLogout === 'function') {
        const originalUpdateUIForLogout = updateUIForLogout;
        updateUIForLogout = function() {
            originalUpdateUIForLogout();
            // 移除所有编辑图标按钮
            const editEmojiButtons = document.querySelectorAll('.edit-emoji-btn');
            editEmojiButtons.forEach(btn => {
                btn.remove();
            });
        };
    }

    // 导航栏管理功能
    // 加载导航文字
    function loadNavText() {
        try {
            const savedNavText = localStorage.getItem('navText');
            if (savedNavText) {
                const navText = JSON.parse(savedNavText);
                
                // 更新品牌名称
                const navBrand = document.querySelector('.nav-brand');
                if (navBrand) {
                    navBrand.textContent = navText.brandName;
                }
                
                // 更新导航链接
                const navLinks = document.querySelectorAll('.nav-link');
                navLinks.forEach(link => {
                    const page = link.getAttribute('data-page');
                    if (page && navText[page]) {
                        link.textContent = navText[page];
                    }
                });
            }
        } catch (error) {
            console.error('加载导航文字失败:', error);
        }
    }

    // 保存导航文字
    function saveNavText(navText) {
        try {
            localStorage.setItem('navText', JSON.stringify(navText));
            loadNavText();
            alert('导航文字更新成功！🔄');
        } catch (error) {
            console.error('保存导航文字失败:', error);
            alert('导航文字更新失败，请重试');
        }
    }

    // 打开编辑导航文字模态框
    function openNavModal() {
        // 检查登录状态
        if (!isLoggedIn) {
            alert('请先登录后再编辑导航文字！');
            return;
        }
        
        const modal = document.getElementById('navModal');
        const brandNameInput = document.getElementById('brandNameInput');
        const aboutNavInput = document.getElementById('aboutNavInput');
        const projectsNavInput = document.getElementById('projectsNavInput');
        const contactNavInput = document.getElementById('contactNavInput');
        
        if (modal && brandNameInput && aboutNavInput && projectsNavInput && contactNavInput) {
            // 填充当前导航文字
            const navBrand = document.querySelector('.nav-brand');
            const navLinks = document.querySelectorAll('.nav-link');
            
            if (navBrand) {
                brandNameInput.value = navBrand.textContent;
            }
            
            navLinks.forEach(link => {
                const page = link.getAttribute('data-page');
                if (page === 'about') {
                    aboutNavInput.value = link.textContent;
                } else if (page === 'projects') {
                    projectsNavInput.value = link.textContent;
                } else if (page === 'contact') {
                    contactNavInput.value = link.textContent;
                }
            });
            
            modal.classList.add('active');
        }
    }

    // 关闭编辑导航文字模态框
    function closeNavModal() {
        const modal = document.getElementById('navModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    // 绑定编辑导航文字模态框关闭事件
    const navModalClose = document.querySelector('#navModal .modal-close');
    if (navModalClose) {
        navModalClose.addEventListener('click', closeNavModal);
    }

    // 绑定编辑导航文字表单提交事件
    const navForm = document.getElementById('navForm');
    if (navForm) {
        navForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const brandNameInput = document.getElementById('brandNameInput');
            const aboutNavInput = document.getElementById('aboutNavInput');
            const projectsNavInput = document.getElementById('projectsNavInput');
            const contactNavInput = document.getElementById('contactNavInput');
            
            if (brandNameInput && aboutNavInput && projectsNavInput && contactNavInput) {
                const navText = {
                    brandName: brandNameInput.value,
                    about: aboutNavInput.value,
                    projects: projectsNavInput.value,
                    contact: contactNavInput.value
                };
                
                saveNavText(navText);
                closeNavModal();
            }
        });
    }

    // 点击编辑导航文字模态框外部关闭
    const navModal = document.getElementById('navModal');
    if (navModal) {
        navModal.addEventListener('click', (e) => {
            if (e.target === navModal) {
                closeNavModal();
            }
        });
    }

    // 为导航栏添加编辑按钮
    function addNavEditButton() {
        const navBrand = document.querySelector('.nav-brand');
        if (navBrand && isLoggedIn) {
            // 检查是否已经有编辑按钮
            if (!navBrand.querySelector('.edit-nav-btn')) {
                const editBtn = document.createElement('button');
                editBtn.className = 'edit-nav-btn';
                editBtn.textContent = '✏️';
                editBtn.title = '编辑导航文字';
                editBtn.style.cssText = `
                    margin-left: 1rem;
                    background: none;
                    border: none;
                    cursor: pointer;
                    font-size: 1rem;
                `;
                
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openNavModal();
                });
                
                navBrand.appendChild(editBtn);
            }
        }
    }

    // 小玩偶苹果功能
    function initAppleDoll() {
        const navBrand = document.querySelector('.nav-brand');
        const appleDoll = document.getElementById('appleDoll');
        
        if (navBrand && appleDoll) {
            navBrand.addEventListener('mouseenter', (e) => {
                // 显示小玩偶苹果
                appleDoll.style.display = 'block';
                
                // 设置初始位置（在品牌名称左边）
                const rect = navBrand.getBoundingClientRect();
                appleDoll.style.left = `${rect.left - 40}px`;
                appleDoll.style.top = `${rect.top}px`;
                
                // 保存原始样式
                const originalTransform = navBrand.style.transform;
                const originalTransition = navBrand.style.transition;
                
                // 跳动动画效果
                let position = 0;
                let direction = 1;
                const interval = setInterval(() => {
                    position += direction;
                    appleDoll.style.top = `${rect.top - position}px`;
                    navBrand.style.transform = `translateY(-${position}px)`;
                    navBrand.style.transition = 'transform 0.1s ease';
                    
                    if (position > 10) {
                        direction = -1;
                    } else if (position < 0) {
                        direction = 1;
                    }
                }, 30);
                
                // 3秒后停止动画并隐藏
                setTimeout(() => {
                    clearInterval(interval);
                    appleDoll.style.display = 'none';
                    // 恢复原始样式
                    navBrand.style.transform = originalTransform;
                    navBrand.style.transition = originalTransition;
                }, 3000);
            });
        }
    }

    // 初始化导航文字
    loadNavText();

    // 初始化小玩偶苹果功能
    initAppleDoll();

    // 修改登录函数，添加导航编辑按钮
    if (typeof updateUIForLogin === 'function') {
        const originalUpdateUIForLogin = updateUIForLogin;
        updateUIForLogin = function() {
            originalUpdateUIForLogin();
            addNavEditButton();
        };
    }

    // 修改登出函数，移除导航编辑按钮
    if (typeof updateUIForLogout === 'function') {
        const originalUpdateUIForLogout = updateUIForLogout;
        updateUIForLogout = function() {
            originalUpdateUIForLogout();
            // 移除导航编辑按钮
            const editNavButtons = document.querySelectorAll('.edit-nav-btn');
            editNavButtons.forEach(btn => {
                btn.remove();
            });
            // 确保所有编辑按钮都被移除
            const navBrand = document.querySelector('.nav-brand');
            if (navBrand) {
                const editBtn = navBrand.querySelector('.edit-nav-btn');
                if (editBtn) {
                    editBtn.remove();
                }
            }
        };
    }

    // 确保在页面加载时初始化导航编辑按钮（如果已登录）
    if (isLoggedIn) {
        addNavEditButton();
    }
});

// ========== 工作经历卡片书签系统 ==========
(function() {
    // 每个工作经历的书签数据
    const expBookmarksData = new Map();
    let activeExpBookmark = { expIndex: null, bookmarkIndex: null };
    
    // 获取登录状态
    function getLoginStatus() {
        return window.isLoggedIn && typeof window.isLoggedIn === 'function' ? window.isLoggedIn() : false;
    }
    
    // 从localStorage加载工作经历书签
    function loadExpBookmarks() {
        try {
            const saved = localStorage.getItem('expBookmarks');
            if (saved) {
                const data = JSON.parse(saved);
                Object.keys(data).forEach(key => {
                    expBookmarksData.set(parseInt(key), data[key]);
                });
            }
        } catch (error) {
            console.error('加载工作经历书签失败:', error);
        }
    }
    
    // 保存工作经历书签到localStorage
    function saveExpBookmarks() {
        try {
            const data = {};
            expBookmarksData.forEach((value, key) => {
                data[key] = value;
            });
            localStorage.setItem('expBookmarks', JSON.stringify(data));
        } catch (error) {
            console.error('保存工作经历书签失败:', error);
        }
    }
    
    // 获取工作经历的书签
    function getExpBookmarks(expIndex) {
        if (!expBookmarksData.has(expIndex)) {
            // 默认书签
            expBookmarksData.set(expIndex, [
                { id: Date.now(), title: '详情', content: '点击编辑详情内容...\n\n您可以在这里添加工作经历的详细说明，支持换行排版。' }
            ]);
        }
        return expBookmarksData.get(expIndex);
    }
    
    // 渲染工作经历的书签
    function renderExpBookmarks(expIndex) {
        const tabsContainer = document.getElementById(`expBookmarkTabs-${expIndex}`);
        const panel = document.getElementById(`expBookmarkPanel-${expIndex}`);
        const bodyContainer = document.getElementById(`expBookmarkBody-${expIndex}`);
        
        console.log(`渲染工作经历 ${expIndex} 的书签:`, { tabsContainer: !!tabsContainer, panel: !!panel, bodyContainer: !!bodyContainer });
        
        if (!tabsContainer || !panel || !bodyContainer) {
            console.warn(`工作经历 ${expIndex} 的书签容器未找到`);
            return;
        }
        
        const bookmarks = getExpBookmarks(expIndex);
        const isActive = activeExpBookmark.expIndex === expIndex;
        const activeBookmarkIdx = isActive ? activeExpBookmark.bookmarkIndex : -1;
        
        // 渲染标签
        tabsContainer.innerHTML = '';
        bookmarks.forEach((bookmark, index) => {
            const tab = document.createElement('div');
            tab.className = `exp-bookmark-tab ${isActive && index === activeBookmarkIdx ? 'active' : ''}`;
            tab.innerHTML = `
                <span>${bookmark.title}</span>
                ${getLoginStatus() ? `
                    <button class="edit-tab-btn" title="编辑名称">✏️</button>
                    <button class="delete-tab-btn" title="删除">🗑️</button>
                ` : ''}
            `;
            
            // 点击标签展开面板
            tab.addEventListener('click', (e) => {
                if (e.target.classList.contains('edit-tab-btn')) {
                    e.stopPropagation();
                    editExpBookmarkTitle(expIndex, index);
                } else if (e.target.classList.contains('delete-tab-btn')) {
                    e.stopPropagation();
                    deleteExpBookmark(expIndex, index);
                } else {
                    openExpBookmarkPanel(expIndex, index);
                }
            });
            
            tabsContainer.appendChild(tab);
        });
        
        // 添加"+"按钮
        if (getLoginStatus()) {
            const addBtn = document.createElement('div');
            addBtn.className = 'exp-bookmark-add';
            addBtn.innerHTML = '<span>+</span>';
            addBtn.title = '添加书签';
            addBtn.addEventListener('click', () => addExpBookmark(expIndex));
            tabsContainer.appendChild(addBtn);
        }
        
        // 激活或关闭容器
        const container = panel.closest('.exp-bookmark-container');
        if (isActive && activeBookmarkIdx >= 0 && bookmarks[activeBookmarkIdx]) {
            if (container) {
                container.classList.add('active');
            }
            const bookmark = bookmarks[activeBookmarkIdx];
            bodyContainer.innerHTML = `
                <h5>${bookmark.title}</h5>
                <div class="exp-bookmark-body-content" id="expBookmarkContent-${expIndex}-${activeBookmarkIdx}">
                    ${getLoginStatus() ? '<span class="edit-hint">点击编辑</span>' : ''}
                    ${bookmark.content}
                </div>
            `;
            
            // 绑定编辑事件
            if (getLoginStatus()) {
                const contentEl = document.getElementById(`expBookmarkContent-${expIndex}-${activeBookmarkIdx}`);
                contentEl.addEventListener('click', () => {
                    editExpBookmarkContent(expIndex, activeBookmarkIdx);
                });
            }
            
            panel.classList.add('open');
        } else {
            if (container) {
                container.classList.remove('active');
            }
            panel.classList.remove('open');
        }
    }
    
    // 打开书签面板
    function openExpBookmarkPanel(expIndex, bookmarkIndex) {
        if (activeExpBookmark.expIndex === expIndex && activeExpBookmark.bookmarkIndex === bookmarkIndex) {
            // 如果点击已打开的书签，则关闭
            closeExpBookmarkPanel();
        } else {
            activeExpBookmark = { expIndex, bookmarkIndex };
            // 关闭其他所有面板
            document.querySelectorAll('.exp-bookmark-panel').forEach(p => p.classList.remove('open'));
            document.querySelectorAll('.exp-bookmark-container').forEach(c => c.classList.remove('active'));
            renderExpBookmarks(expIndex);
        }
    }
    
    // 关闭书签面板
    function closeExpBookmarkPanel() {
        activeExpBookmark = { expIndex: null, bookmarkIndex: null };
        document.querySelectorAll('.exp-bookmark-panel').forEach(p => p.classList.remove('open'));
        document.querySelectorAll('.exp-bookmark-container').forEach(c => c.classList.remove('active'));
        // 重新渲染所有工作经历的书签标签状态
        document.querySelectorAll('.timeline-item').forEach(item => {
            const expIndex = parseInt(item.dataset.experienceIndex);
            if (!isNaN(expIndex)) {
                renderExpBookmarks(expIndex);
            }
        });
    }
    
    // 添加书签
    function addExpBookmark(expIndex) {
        if (!isLoggedIn) {
            alert('请先登录后再添加书签！');
            return;
        }
        
        const bookmarks = getExpBookmarks(expIndex);
        const newBookmark = {
            id: Date.now(),
            title: `书签${bookmarks.length + 1}`,
            content: '点击编辑内容...\n\n在这里输入详细内容。'
        };
        bookmarks.push(newBookmark);
        saveExpBookmarks();
        renderExpBookmarks(expIndex);
        // 自动打开新书签
        openExpBookmarkPanel(expIndex, bookmarks.length - 1);
    }
    
    // 删除书签
    function deleteExpBookmark(expIndex, bookmarkIndex) {
        if (!getLoginStatus()) return;
        
        const bookmarks = getExpBookmarks(expIndex);
        if (confirm(`确定要删除"${bookmarks[bookmarkIndex].title}"吗？`)) {
            bookmarks.splice(bookmarkIndex, 1);
            saveExpBookmarks();
            
            // 如果删除的是当前打开的书签，关闭面板
            if (activeExpBookmark.expIndex === expIndex && activeExpBookmark.bookmarkIndex === bookmarkIndex) {
                closeExpBookmarkPanel();
            } else {
                renderExpBookmarks(expIndex);
            }
        }
    }
    
    // 编辑书签标题
    function editExpBookmarkTitle(expIndex, bookmarkIndex) {
        if (!getLoginStatus()) return;
        
        const bookmarks = getExpBookmarks(expIndex);
        const newTitle = prompt('请输入新的书签名称:', bookmarks[bookmarkIndex].title);
        if (newTitle && newTitle.trim()) {
            bookmarks[bookmarkIndex].title = newTitle.trim();
            saveExpBookmarks();
            renderExpBookmarks(expIndex);
        }
    }
    
    // 编辑书签内容
    function editExpBookmarkContent(expIndex, bookmarkIndex) {
        if (!getLoginStatus()) return;
        
        const bookmarks = getExpBookmarks(expIndex);
        const bookmark = bookmarks[bookmarkIndex];
        const bodyContainer = document.getElementById(`expBookmarkBody-${expIndex}`);
        
        bodyContainer.innerHTML = `
            <h5>${bookmark.title}</h5>
            <div class="exp-bookmark-edit-mode">
                <textarea id="expBookmarkEditText-${expIndex}">${bookmark.content}</textarea>
                <div class="exp-bookmark-edit-actions">
                    <button class="exp-bookmark-cancel-btn" onclick="cancelExpBookmarkEdit(${expIndex})">取消</button>
                    <button class="exp-bookmark-save-btn" onclick="saveExpBookmarkEdit(${expIndex}, ${bookmarkIndex})">保存</button>
                </div>
            </div>
        `;
        
        // 自动调整高度
        const textarea = document.getElementById(`expBookmarkEditText-${expIndex}`);
        textarea.style.height = textarea.scrollHeight + 'px';
        textarea.focus();
    }
    
    // 保存编辑（暴露到全局）
    window.saveExpBookmarkEdit = function(expIndex, bookmarkIndex) {
        const textarea = document.getElementById(`expBookmarkEditText-${expIndex}`);
        if (textarea) {
            const bookmarks = getExpBookmarks(expIndex);
            bookmarks[bookmarkIndex].content = textarea.value;
            saveExpBookmarks();
            renderExpBookmarks(expIndex);
        }
    };
    
    // 取消编辑（暴露到全局）
    window.cancelExpBookmarkEdit = function(expIndex) {
        renderExpBookmarks(expIndex);
    };
    
    // 初始化工作经历书签
    function initExpBookmarks() {
        loadExpBookmarks();
        
        console.log('初始化工作经历书签...');
        
        // 为每个工作经历渲染书签
        document.querySelectorAll('.timeline-item').forEach(item => {
            const expIndex = parseInt(item.dataset.experienceIndex);
            console.log('工作经历索引:', expIndex);
            if (!isNaN(expIndex)) {
                renderExpBookmarks(expIndex);
                
                // 绑定关闭按钮
                const closeBtn = item.querySelector('.exp-bookmark-close');
                if (closeBtn) {
                    closeBtn.addEventListener('click', closeExpBookmarkPanel);
                }
            }
        });
    }
    
    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initExpBookmarks);
    } else {
        initExpBookmarks();
    }
    
    // 监听登录状态变化
    const expBookmarkOriginalUpdateUIForLogin = window.updateUIForLogin;
    window.updateUIForLogin = function() {
        if (expBookmarkOriginalUpdateUIForLogin) expBookmarkOriginalUpdateUIForLogin();
        setTimeout(initExpBookmarks, 100);
    };
    
    const expBookmarkOriginalUpdateUIForLogout = window.updateUIForLogout;
    window.updateUIForLogout = function() {
        if (expBookmarkOriginalUpdateUIForLogout) expBookmarkOriginalUpdateUIForLogout();
        setTimeout(initExpBookmarks, 100);
    };
})();

// ========== 文字直接编辑功能（支持换行） ==========
(function() {
    // 可编辑的文字类名列表
    const editableClasses = [
        'about-description',
        'timeline-description', 
        'skill-description',
        'project-description',
        'contact-text'
    ];
    
    let currentEditingElement = null;
    let currentTextarea = null;
    
    // 从localStorage加载保存的文字
    function loadSavedText(element) {
        const key = 'text_' + element.className + '_' + getElementPath(element);
        const saved = localStorage.getItem(key);
        if (saved) {
            element.textContent = saved;
        }
    }
    
    // 保存文字到localStorage
    function saveText(element, text) {
        const key = 'text_' + element.className + '_' + getElementPath(element);
        localStorage.setItem(key, text);
    }
    
    // 获取元素路径（用于唯一标识）
    function getElementPath(element) {
        let path = '';
        let current = element;
        while (current && current !== document.body) {
            const index = Array.from(current.parentElement?.children || []).indexOf(current);
            path = current.className + '[' + index + ']' + (path ? '>' + path : '');
            current = current.parentElement;
        }
        return path;
    }
})();

// ========== 项目展示区域书签系统 ==========
(function() {
    // 书签数据
    let bookmarks = [];
    let activeBookmarkId = null;
    
    // 获取登录状态
    function getLoginStatus() {
        return window.isLoggedIn && typeof window.isLoggedIn === 'function' ? window.isLoggedIn() : false;
    }
    
    // 从localStorage加载书签
    function loadBookmarks() {
        try {
            const saved = localStorage.getItem('projectBookmarks');
            if (saved) {
                bookmarks = JSON.parse(saved);
            } else {
                // 默认书签
                bookmarks = [
                    { id: 1, title: '项目一', content: '点击编辑内容...\n\n支持多行换行排版。' },
                    { id: 2, title: '项目二', content: '点击编辑内容...\n\n支持多行换行排版。' },
                    { id: 3, title: '项目三', content: '点击编辑内容...\n\n支持多行换行排版。' }
                ];
                saveBookmarks();
            }
        } catch (error) {
            console.error('加载书签失败:', error);
            bookmarks = [];
        }
    }
    
    // 保存书签到localStorage
    function saveBookmarks() {
        try {
            localStorage.setItem('projectBookmarks', JSON.stringify(bookmarks));
        } catch (error) {
            console.error('保存书签失败:', error);
        }
    }
    
    // 渲染书签
    function renderBookmarks() {
        const tabsContainer = document.querySelector('.bookmark-tabs');
        const contentContainer = document.querySelector('.bookmark-content');
        
        if (!tabsContainer || !contentContainer) {
            return;
        }
        
        const isLoggedIn = getLoginStatus();
        
        // 渲染标签
        tabsContainer.innerHTML = '';
        bookmarks.forEach(bookmark => {
            const tab = document.createElement('div');
            tab.className = `bookmark-tab ${activeBookmarkId === bookmark.id ? 'active' : ''}`;
            tab.setAttribute('data-bookmark', bookmark.id);
            tab.innerHTML = `
                <span>${bookmark.title}</span>
                ${isLoggedIn ? `
                    <button class="bookmark-edit-btn" title="编辑名称">✏️</button>
                    <button class="bookmark-delete-btn" title="删除">🗑️</button>
                ` : ''}
            `;
            
            // 点击标签
            tab.addEventListener('click', (e) => {
                if (e.target.classList.contains('bookmark-edit-btn')) {
                    e.stopPropagation();
                    editBookmarkTitle(bookmark.id);
                } else if (e.target.classList.contains('bookmark-delete-btn')) {
                    e.stopPropagation();
                    deleteBookmark(bookmark.id);
                } else {
                    activateBookmark(bookmark.id);
                }
            });
            
            tabsContainer.appendChild(tab);
        });
        
        // 添加新书签按钮
        if (isLoggedIn) {
            const addBtn = document.createElement('div');
            addBtn.className = 'bookmark-add';
            addBtn.innerHTML = '<span>+</span>';
            addBtn.title = '添加书签 ➕';
            addBtn.addEventListener('click', addBookmark);
            tabsContainer.appendChild(addBtn);
        }
        
        // 渲染内容面板
        contentContainer.innerHTML = '';
        bookmarks.forEach(bookmark => {
            const panel = document.createElement('div');
            panel.className = `bookmark-panel ${activeBookmarkId === bookmark.id ? 'active' : ''}`;
            panel.setAttribute('data-bookmark', bookmark.id);
            panel.innerHTML = `
                <h3>${bookmark.title}</h3>
                <p>${bookmark.content}</p>
                ${isLoggedIn ? `
                    <button class="btn btn-primary mt-4" onclick="editBookmarkContent(${bookmark.id})">编辑内容</button>
                ` : ''}
            `;
            
            contentContainer.appendChild(panel);
        });
    }
    
    // 激活书签
    function activateBookmark(bookmarkId) {
        activeBookmarkId = bookmarkId;
        renderBookmarks();
    }
    
    // 添加书签
    function addBookmark() {
        const isLoggedIn = getLoginStatus();
        if (!isLoggedIn) {
            alert('请先登录才能添加书签！');
            return;
        }
        
        const newBookmark = {
            id: Date.now(),
            title: `项目${bookmarks.length + 1}`,
            content: '点击编辑内容...\n\n支持多行换行排版。'
        };
        bookmarks.push(newBookmark);
        saveBookmarks();
        activateBookmark(newBookmark.id);
    }
    
    // 删除书签
    function deleteBookmark(bookmarkId) {
        const isLoggedIn = getLoginStatus();
        if (!isLoggedIn) {
            alert('请先登录才能删除书签！');
            return;
        }
        
        const bookmark = bookmarks.find(b => b.id === bookmarkId);
        if (bookmark && confirm(`确定要删除"${bookmark.title}"吗？`)) {
            bookmarks = bookmarks.filter(b => b.id !== bookmarkId);
            saveBookmarks();
            activeBookmarkId = bookmarks.length > 0 ? bookmarks[0].id : null;
            renderBookmarks();
        }
    }
    
    // 编辑书签标题
    function editBookmarkTitle(bookmarkId) {
        const isLoggedIn = getLoginStatus();
        if (!isLoggedIn) {
            alert('请先登录才能编辑书签！');
            return;
        }
        
        const bookmark = bookmarks.find(b => b.id === bookmarkId);
        if (bookmark) {
            const newTitle = prompt('请输入新的书签名称:', bookmark.title);
            if (newTitle && newTitle.trim()) {
                bookmark.title = newTitle.trim();
                saveBookmarks();
                renderBookmarks();
            }
        }
    }
    
    // 编辑书签内容
    function editBookmarkContent(bookmarkId) {
        const isLoggedIn = getLoginStatus();
        if (!isLoggedIn) {
            alert('请先登录才能编辑内容！');
            return;
        }
        
        const bookmark = bookmarks.find(b => b.id === bookmarkId);
        if (!bookmark) return;
        
        const panel = document.querySelector(`.bookmark-panel[data-bookmark="${bookmarkId}"]`);
        if (!panel) return;
        
        panel.innerHTML = `
            <h3>${bookmark.title}</h3>
            <div class="bookmark-edit-mode">
                <textarea id="bookmarkEditContent">${bookmark.content}</textarea>
                <div class="bookmark-edit-actions">
                    <button class="bookmark-cancel-btn" onclick="cancelBookmarkEdit(${bookmarkId})">取消</button>
                    <button class="bookmark-save-btn" onclick="saveBookmarkEdit(${bookmarkId})">保存</button>
                </div>
            </div>
        `;
        
        // 自动调整高度
        const textarea = document.getElementById('bookmarkEditContent');
        textarea.style.height = textarea.scrollHeight + 'px';
        textarea.focus();
    }
    
    // 保存书签编辑
    window.saveBookmarkEdit = function(bookmarkId) {
        const isLoggedIn = getLoginStatus();
        if (!isLoggedIn) {
            alert('请先登录才能保存编辑！');
            renderBookmarks();
            return;
        }
        
        const textarea = document.getElementById('bookmarkEditContent');
        if (!textarea) return;
        
        const bookmark = bookmarks.find(b => b.id === bookmarkId);
        if (bookmark) {
            bookmark.content = textarea.value;
            saveBookmarks();
            renderBookmarks();
        }
    };
    
    // 取消书签编辑
    window.cancelBookmarkEdit = function(bookmarkId) {
        renderBookmarks();
    };
    
    // 初始化书签系统
    function initBookmarks() {
        loadBookmarks();
        if (bookmarks.length > 0) {
            activeBookmarkId = bookmarks[0].id;
        }
        renderBookmarks();
    }
    
    // 页面加载完成后初始化
    function initAfterLoginSystem() {
        // 确保登录系统已经初始化
        if (window.isLoggedIn && typeof window.isLoggedIn === 'function') {
            initBookmarks();
        } else {
            // 如果登录系统还未初始化，延迟执行
            setTimeout(initAfterLoginSystem, 100);
        }
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAfterLoginSystem);
    } else {
        initAfterLoginSystem();
    }
    
    // 监听登录状态变化
    const originalUpdateUIForLogin = window.updateUIForLogin;
    window.updateUIForLogin = function() {
        if (originalUpdateUIForLogin) originalUpdateUIForLogin();
        setTimeout(initBookmarks, 100);
    };
    
    const originalUpdateUIForLogout = window.updateUIForLogout;
    window.updateUIForLogout = function() {
        if (originalUpdateUIForLogout) originalUpdateUIForLogout();
        setTimeout(initBookmarks, 100);
    };
    
    // 导出函数供全局使用
    window.editBookmarkContent = editBookmarkContent;
    window.saveBookmarkEdit = window.saveBookmarkEdit;
    window.cancelBookmarkEdit = window.cancelBookmarkEdit;
})();

// ========== 文字直接编辑功能（支持换行） ==========
(function() {
    // 可编辑的文字类名列表
    const editableClasses = [
        'about-description',
        'timeline-description', 
        'skill-description',
        'project-description',
        'contact-text'
    ];
    
    let currentEditingElement = null;
    let currentTextarea = null;
    
    // 从localStorage加载保存的文字
    function loadSavedText(element) {
        const key = 'text_' + element.className + '_' + getElementPath(element);
        const saved = localStorage.getItem(key);
        if (saved) {
            element.textContent = saved;
        }
    }
    
    // 保存文字到localStorage
    function saveText(element, text) {
        const key = 'text_' + element.className + '_' + getElementPath(element);
        localStorage.setItem(key, text);
    }
    
    // 获取元素路径（用于唯一标识）
    function getElementPath(element) {
        let path = '';
        let current = element;
        while (current && current !== document.body) {
            const index = Array.from(current.parentElement?.children || []).indexOf(current);
            path = current.className + '[' + index + ']' + (path ? '>' + path : '');
            current = current.parentElement;
        }
        return path;
    }
    
    // 创建编辑按钮
    function createEditButton(element) {
        const btn = document.createElement('button');
        btn.className = 'inline-edit-btn';
        btn.innerHTML = '✏️';
        btn.title = '点击编辑文字（支持换行）';
        btn.style.cssText = `
            position: absolute;
            top: -10px;
            right: -10px;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: var(--primary-blue);
            color: white;
            border: 2px solid white;
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: all 0.3s ease;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            z-index: 100;
        `;
        
        // 鼠标悬停显示按钮
        element.style.position = 'relative';
        element.addEventListener('mouseenter', () => {
            if (isLoggedIn && currentEditingElement !== element) {
                btn.style.opacity = '1';
            }
        });
        element.addEventListener('mouseleave', () => {
            btn.style.opacity = '0';
        });
        
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            startEditing(element);
        });
        
        element.appendChild(btn);
        return btn;
    }
    
    // 开始编辑
    function startEditing(element) {
        if (currentEditingElement) {
            finishEditing();
        }
        
        currentEditingElement = element;
        const originalText = element.childNodes[0]?.textContent || element.textContent;
        
        // 隐藏编辑按钮
        const editBtn = element.querySelector('.inline-edit-btn');
        if (editBtn) editBtn.style.display = 'none';
        
        // 创建textarea
        const textarea = document.createElement('textarea');
        textarea.value = originalText;
        textarea.style.cssText = `
            width: 100%;
            min-height: 100px;
            padding: 10px;
            border: 2px solid var(--primary-blue);
            border-radius: 8px;
            font-family: inherit;
            font-size: inherit;
            line-height: inherit;
            color: inherit;
            background: white;
            resize: vertical;
            outline: none;
            box-shadow: 0 4px 12px rgba(74, 144, 226, 0.3);
        `;
        
        // 清除元素内容并添加textarea
        element.textContent = '';
        element.appendChild(textarea);
        textarea.focus();
        textarea.select();
        currentTextarea = textarea;
        
        // 自动调整高度
        function adjustHeight() {
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
        }
        adjustHeight();
        textarea.addEventListener('input', adjustHeight);
        
        // 点击外部保存
        function handleClickOutside(e) {
            if (!element.contains(e.target)) {
                finishEditing();
                document.removeEventListener('click', handleClickOutside);
            }
        }
        setTimeout(() => {
            document.addEventListener('click', handleClickOutside);
        }, 100);
        
        // ESC键保存
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                finishEditing();
                document.removeEventListener('click', handleClickOutside);
            }
        });
    }
    
    // 结束编辑
    function finishEditing() {
        if (!currentEditingElement || !currentTextarea) return;
        
        const newText = currentTextarea.value;
        const element = currentEditingElement;
        
        // 保存到localStorage
        saveText(element, newText);
        
        // 恢复显示
        element.textContent = newText;
        
        // 重新创建编辑按钮
        createEditButton(element);
        
        currentEditingElement = null;
        currentTextarea = null;
    }
    
    // 初始化所有可编辑文字
    function initEditableText() {
        if (!isLoggedIn) return;
        
        editableClasses.forEach(className => {
            const elements = document.querySelectorAll('.' + className);
            elements.forEach((element, index) => {
                // 加载保存的文字
                loadSavedText(element);
                
                // 创建编辑按钮
                createEditButton(element);
                
                // 双击编辑
                element.addEventListener('dblclick', (e) => {
                    if (isLoggedIn) {
                        e.preventDefault();
                        startEditing(element);
                    }
                });
            });
        });
    }
    
    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initEditableText);
    } else {
        initEditableText();
    }
    
    // 监听登录状态变化
    const editableTextOriginalUpdateUIForLogin = window.updateUIForLogin;
    window.updateUIForLogin = function() {
        if (editableTextOriginalUpdateUIForLogin) editableTextOriginalUpdateUIForLogin();
        setTimeout(initEditableText, 100);
    };
    
    const editableTextOriginalUpdateUIForLogout = window.updateUIForLogout;
    window.updateUIForLogout = function() {
        if (editableTextOriginalUpdateUIForLogout) editableTextOriginalUpdateUIForLogout();
        // 移除所有编辑按钮
        document.querySelectorAll('.inline-edit-btn').forEach(btn => btn.remove());
    };
    
    // 如果已经登录，立即初始化
    if (typeof isLoggedIn !== 'undefined' && isLoggedIn) {
        setTimeout(initEditableText, 500);
    }
})();

// 书签式抽拉效果功能
(function() {
    // 书签数据
    let bookmarks = [
        {
            id: 1,
            title: '项目一',
            content: '点击编辑内容...\n\n支持多行换行排版。'
        },
        {
            id: 2,
            title: '项目二',
            content: '点击编辑内容...\n\n支持多行换行排版。'
        },
        {
            id: 3,
            title: '项目三',
            content: '点击编辑内容...\n\n支持多行换行排版。'
        }
    ];
    
    // 初始化书签
    function initBookmarks() {
        // 绑定书签点击事件
        document.querySelectorAll('.bookmark-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                const bookmarkId = parseInt(this.dataset.bookmark);
                activateBookmark(bookmarkId);
            });
        });
        
        // 绑定编辑和删除按钮事件
        document.querySelectorAll('.bookmark-edit-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const tab = this.closest('.bookmark-tab');
                const bookmarkId = parseInt(tab.dataset.bookmark);
                editBookmarkTitle(bookmarkId);
            });
        });
        
        document.querySelectorAll('.bookmark-delete-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const tab = this.closest('.bookmark-tab');
                const bookmarkId = parseInt(tab.dataset.bookmark);
                deleteBookmark(bookmarkId);
            });
        });
        
        // 绑定添加书签按钮事件
        document.querySelector('.bookmark-add').addEventListener('click', addBookmark);
    }
    
    // 激活书签
    function activateBookmark(bookmarkId) {
        // 移除所有活动状态
        document.querySelectorAll('.bookmark-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.bookmark-panel').forEach(panel => panel.classList.remove('active'));
        
        // 添加活动状态
        document.querySelector(`[data-bookmark="${bookmarkId}"]`).classList.add('active');
        document.querySelector(`.bookmark-panel[data-bookmark="${bookmarkId}"]`).classList.add('active');
    }
    
    // 编辑书签标题
    function editBookmarkTitle(bookmarkId) {
        const bookmark = bookmarks.find(b => b.id === bookmarkId);
        if (!bookmark) return;
        
        const newTitle = prompt('请输入新的书签名称:', bookmark.title);
        if (newTitle && newTitle.trim()) {
            bookmark.title = newTitle.trim();
            document.querySelector(`[data-bookmark="${bookmarkId}"] span`).textContent = newTitle.trim();
            document.querySelector(`.bookmark-panel[data-bookmark="${bookmarkId}"] h3`).textContent = newTitle.trim();
        }
    }
    
    // 删除书签
    function deleteBookmark(bookmarkId) {
        if (bookmarks.length <= 1) {
            alert('至少需要保留一个书签');
            return;
        }
        
        if (confirm('确定要删除这个书签吗？')) {
            bookmarks = bookmarks.filter(b => b.id !== bookmarkId);
            // 移除DOM元素
            document.querySelector(`[data-bookmark="${bookmarkId}"]`).remove();
            document.querySelector(`.bookmark-panel[data-bookmark="${bookmarkId}"]`).remove();
            // 激活第一个书签
            if (bookmarks.length > 0) {
                activateBookmark(bookmarks[0].id);
            }
        }
    }
    
    // 添加书签
    function addBookmark() {
        const newId = Date.now();
        const newBookmark = {
            id: newId,
            title: `项目${bookmarks.length + 1}`,
            content: '点击编辑内容...\n\n支持多行换行排版。'
        };
        bookmarks.push(newBookmark);
        
        // 添加书签标签
        const tabsContainer = document.querySelector('.bookmark-tabs');
        const addBtn = document.querySelector('.bookmark-add');
        const newTab = document.createElement('div');
        newTab.className = 'bookmark-tab';
        newTab.dataset.bookmark = newId;
        newTab.innerHTML = `
            <span>${newBookmark.title}</span>
            <button class="bookmark-edit-btn" title="编辑名称">✏️</button>
            <button class="bookmark-delete-btn" title="删除">🗑️</button>
        `;
        tabsContainer.insertBefore(newTab, addBtn);
        
        // 添加书签面板
        const contentContainer = document.querySelector('.bookmark-content');
        const newPanel = document.createElement('div');
        newPanel.className = 'bookmark-panel';
        newPanel.dataset.bookmark = newId;
        newPanel.innerHTML = `
            <h3>${newBookmark.title}</h3>
            <p>${newBookmark.content}</p>
            <button class="btn btn-primary mt-4" onclick="editBookmarkContent(${newId})")">编辑内容</button>
        `;
        contentContainer.appendChild(newPanel);
        
        // 绑定事件
        newTab.addEventListener('click', function() {
            activateBookmark(newId);
        });
        
        newTab.querySelector('.bookmark-edit-btn').addEventListener('click', function(e) {
            e.stopPropagation();
            editBookmarkTitle(newId);
        });
        
        newTab.querySelector('.bookmark-delete-btn').addEventListener('click', function(e) {
            e.stopPropagation();
            deleteBookmark(newId);
        });
        
        // 激活新书签
        activateBookmark(newId);
    }
    
    // 编辑书签内容
    window.editBookmarkContent = function(bookmarkId) {
        const bookmark = bookmarks.find(b => b.id === bookmarkId);
        if (!bookmark) return;
        
        const panel = document.querySelector(`.bookmark-panel[data-bookmark="${bookmarkId}"]`);
        if (!panel) return;
        
        panel.innerHTML = `
            <h3>${bookmark.title}</h3>
            <div class="bookmark-edit-mode">
                <textarea id="bookmarkEditText-${bookmarkId}">${bookmark.content}</textarea>
                <div class="bookmark-edit-actions">
                    <button class="bookmark-cancel-btn" onclick="cancelBookmarkEdit(${bookmarkId})")">取消</button>
                    <button class="bookmark-save-btn" onclick="saveBookmarkEdit(${bookmarkId})")">保存</button>
                </div>
            </div>
        `;
        
        // 自动调整高度
        const textarea = document.getElementById(`bookmarkEditText-${bookmarkId}`);
        textarea.style.height = textarea.scrollHeight + 'px';
        textarea.focus();
    };
    
    // 保存编辑
    window.saveBookmarkEdit = function(bookmarkId) {
        const bookmark = bookmarks.find(b => b.id === bookmarkId);
        if (!bookmark) return;
        
        const textarea = document.getElementById(`bookmarkEditText-${bookmarkId}`);
        if (!textarea) return;
        
        bookmark.content = textarea.value;
        const panel = document.querySelector(`.bookmark-panel[data-bookmark="${bookmarkId}"]`);
        panel.innerHTML = `
            <h3>${bookmark.title}</h3>
            <p>${bookmark.content}</p>
            <button class="btn btn-primary mt-4" onclick="editBookmarkContent(${bookmarkId})")">编辑内容</button>
        `;
    };
    
    // 取消编辑
    window.cancelBookmarkEdit = function(bookmarkId) {
        const bookmark = bookmarks.find(b => b.id === bookmarkId);
        if (!bookmark) return;
        
        const panel = document.querySelector(`.bookmark-panel[data-bookmark="${bookmarkId}"]`);
        panel.innerHTML = `
            <h3>${bookmark.title}</h3>
            <p>${bookmark.content}</p>
            <button class="btn btn-primary mt-4" onclick="editBookmarkContent(${bookmarkId})")">编辑内容</button>
        `;
    };
    
    // 页面加载时初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBookmarks);
    } else {
        initBookmarks();
    }
})();
