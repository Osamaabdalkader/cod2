// نظام الإحالة المتكامل
class ReferralSystem {
    constructor() {
        this.currentUser = null;
        this.userData = null;
        this.networkData = null;
        this.userDataCache = {};
        this.currentPage = 1;
        this.pageSize = 10;
        this.totalPages = 1;
        this.filteredMembers = [];
        
        // التحقق من وجود Firebase
        if (typeof firebase === 'undefined') {
            console.error("Firebase is not loaded");
            this.showGlobalAlert("error", "لم يتم تحميل Firebase بشكل صحيح. يرجى تحديث الصفحة.");
            return;
        }
        
        this.init();
    }

    init() {
        try {
            // التحقق من حالة المصادقة
            firebase.auth().onAuthStateChanged((user) => {
                console.log("Auth state changed:", user);
                this.currentUser = user;
                if (user) {
                    this.loadUserData(user.uid);
                    this.updateAuthUI(true);
                    
                    // إذا كانت صفحة الشبكة، تحميل الشبكة
                    if (window.location.pathname.includes('network.html')) {
                        this.loadNetwork();
                    }
                    
                    // إذا كانت صفحة الإدارة، تحميل بيانات الإدارة
                    if (window.location.pathname.includes('management.html')) {
                        this.loadManagementData();
                    }
                } else {
                    this.updateAuthUI(false);
                    // إذا لم يكن في صفحة تسجيل الدخول، إعادة التوجيه
                    if (!window.location.pathname.includes('login.html') && 
                        !window.location.pathname.includes('register.html') &&
                        window.location.pathname !== '/' &&
                        !window.location.pathname.includes('index.html')) {
                        window.location.href = 'index.html';
                    }
                }
            }, (error) => {
                console.error("Auth state change error:", error);
                this.showGlobalAlert("error", "خطأ في نظام المصادقة: " + error.message);
            });

            // إعداد معالج الأحداث
            this.setupEventListeners();
        } catch (error) {
            console.error("Error initializing app:", error);
            this.showGlobalAlert("error", "خطأ في تهيئة التطبيق: " + error.message);
        }
    }

    setupEventListeners() {
        // تسجيل الدخول
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }

        // إنشاء حساب
        const signupBtn = document.getElementById('signup-btn');
        if (signupBtn) {
            signupBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleRegister();
            });
        }

        // تسجيل الخروج
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.handleLogout();
            });
        }

        // نسخ رابط الإحالة
        const copyBtn = document.getElementById('copy-link-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                this.copyReferralLink();
            });
        }

        // مشاركة على وسائل التواصل
        const shareFbBtn = document.getElementById('share-fb');
        const shareTwitterBtn = document.getElementById('share-twitter');
        const shareWhatsappBtn = document.getElementById('share-whatsapp');

        if (shareFbBtn) shareFbBtn.addEventListener('click', () => this.shareOnFacebook());
        if (shareTwitterBtn) shareTwitterBtn.addEventListener('click', () => this.shareOnTwitter());
        if (shareWhatsappBtn) shareWhatsappBtn.addEventListener('click', () => this.shareOnWhatsApp());
    }

    async handleLogin() {
        const email = document.getElementById('login-email');
        const password = document.getElementById('login-password');
        const alert = document.getElementById('login-alert');
        
        if (!email || !password || !email.value || !password.value) {
            this.showAlert(alert, 'error', 'يرجى ملء جميع الحقول');
            return;
        }
        
        try {
            this.showAlert(alert, 'info', 'جاري تسجيل الدخول...');
            const userCredential = await firebase.auth().signInWithEmailAndPassword(email.value, password.value);
            this.showAlert(alert, 'success', 'تم تسجيل الدخول بنجاح');
            
            // تحميل بيانات المستخدم
            await this.loadUserData(userCredential.user.uid);
            
            // الانتقال إلى لوحة التحكم بعد ثانية
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1000);
            
        } catch (error) {
            console.error("Login error:", error);
            let errorMessage = "حدث خطأ أثناء تسجيل الدخول";
            
            if (error.code === 'auth/user-not-found') {
                errorMessage = "البريد الإلكتروني غير مسجل";
            } else if (error.code === 'auth/wrong-password') {
                errorMessage = "كلمة المرور غير صحيحة";
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = "البريد الإلكتروني غير صالح";
            } else if (error.code === 'auth/too-many-requests') {
                errorMessage = "تم محاولة الدخول عدة مرات بشكل خاطئ، يرجى المحاولة لاحقاً";
            }
            
            this.showAlert(alert, 'error', errorMessage);
        }
    }

    async handleRegister() {
        const name = document.getElementById('signup-name');
        const email = document.getElementById('signup-email');
        const password = document.getElementById('signup-password');
        const referralCode = document.getElementById('referral-code');
        const alert = document.getElementById('register-alert');
        
        if (!name || !email || !password || !name.value || !email.value || !password.value) {
            this.showAlert(alert, 'error', 'يرجى ملء جميع الحقول الإلزامية');
            return;
        }
        
        try {
            this.showAlert(alert, 'info', 'جاري إنشاء الحساب...');
            
            // إنشاء المستخدم في Authentication
            const userCredential = await firebase.auth().createUserWithEmailAndPassword(email.value, password.value);
            const userId = userCredential.user.uid;
            
            // إنشاء رمز إحالة فريد
            const userReferralCode = this.generateReferralCode();
            
            // حفظ بيانات المستخدم في Realtime Database
            await firebase.database().ref('users/' + userId).set({
                name: name.value,
                email: email.value,
                referralCode: userReferralCode,
                points: 0,
                joinDate: new Date().toISOString(),
                referredBy: referralCode?.value || null,
                status: 'active'
            });
            
            // حفظ رمز الإحالة للبحث السريع
            await firebase.database().ref('referralCodes/' + userReferralCode).set(userId);
            
            // إذا كان هناك رمز إحالة، إضافة العلاقة
            if (referralCode?.value) {
                await this.processReferral(referralCode.value, userId, name.value, email.value);
            }
            
            this.showAlert(alert, 'success', 'تم إنشاء الحساب بنجاح');
            
            // الانتقال إلى لوحة التحكم بعد ثانية
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1000);
            
        } catch (error) {
            console.error("Registration error:", error);
            let errorMessage = "حدث خطأ أثناء إنشاء الحساب";
            
            if (error.code === 'auth/email-already-in-use') {
                errorMessage = "البريد الإلكتروني مستخدم بالفعل";
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = "البريد الإلكتروني غير صالح";
            } else if (error.code === 'auth/weak-password') {
                errorMessage = "كلمة المرور ضعيفة، يجب أن تكون至少 6 أحرف";
            } else if (error.code === 'auth/operation-not-allowed') {
                errorMessage = "عملية التسجيل غير مسموحة";
            }
            
            this.showAlert(alert, 'error', errorMessage);
        }
    }

    async processReferral(referralCode, newUserId, name, email) {
        try {
            // البحث عن صاحب رمز الإحالة
            const referrerId = await this.getUserIdFromReferralCode(referralCode);
            if (!referrerId) {
                console.log("Referral code not found:", referralCode);
                return;
            }
            
            // إضافة المستخدم الجديد إلى قائمة إحالات المُحيل
            await firebase.database().ref('userReferrals/' + referrerId + '/' + newUserId).set({
                name: name,
                email: email,
                joinDate: new Date().toISOString(),
                level: 1,
                status: 'active'
            });
            
            // منح نقاط للمُحيل
            await firebase.database().ref('users/' + referrerId + '/points').transaction(points => (points || 0) + 10);
            
            // تحديث إحصائيات المُحيل
            await this.updateReferrerStats(referrerId);
            
        } catch (error) {
            console.error("Error processing referral:", error);
        }
    }

    async loadUserData(userId) {
        try {
            const snapshot = await firebase.database().ref('users/' + userId).once('value');
            this.userData = snapshot.val();
            
            if (this.userData) {
                this.updateUserUI();
            }
        } catch (error) {
            console.error("Error loading user data:", error);
        }
    }

    updateUserUI() {
        // تحديث البيانات في واجهة المستخدم
        const usernameEl = document.getElementById('username');
        const userAvatar = document.getElementById('user-avatar');
        const referralsCount = document.getElementById('referrals-count');
        const pointsCount = document.getElementById('points-count');
        const joinDate = document.getElementById('join-date');
        const referralLink = document.getElementById('referral-link');
        
        if (usernameEl && this.userData.name) usernameEl.textContent = this.userData.name;
        if (userAvatar) userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(this.userData.name)}&background=random`;
        if (pointsCount) pointsCount.textContent = this.userData.points || '0';
        if (joinDate) joinDate.textContent = new Date(this.userData.joinDate).toLocaleDateString('ar-SA');
        if (referralLink) referralLink.value = `${window.location.origin}${window.location.pathname}?ref=${this.userData.referralCode}`;
        
        // تحميل عدد الإحالات
        if (referralsCount && this.currentUser) {
            this.loadReferralsCount(this.currentUser.uid).then(count => {
                if (referralsCount) referralsCount.textContent = count;
            });
        }
    }

    async loadReferralsCount(userId) {
        try {
            const snapshot = await firebase.database().ref('userReferrals/' + userId).once('value');
            return snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
        } catch (error) {
            console.error("Error loading referrals count:", error);
            return 0;
        }
    }

    async loadNetwork() {
        const networkContainer = document.getElementById('network-tree');
        if (!networkContainer || !this.currentUser) return;
        
        networkContainer.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> جاري تحميل الشبكة...</div>';
        
        try {
            // تحميل الشبكة الكاملة
            this.networkData = {};
            await this.loadNetworkRecursive(this.currentUser.uid, this.networkData, 0, 10);
            
            // عرض الشبكة
            this.renderNetwork(this.networkData, networkContainer);
            
            // تحديث الإحصائيات
            this.updateNetworkStats();
            
        } catch (error) {
            console.error("Error loading network:", error);
            networkContainer.innerHTML = '<div class="error">فشل في تحميل الشبكة</div>';
        }
    }

    async loadNetworkRecursive(userId, network, currentLevel, maxLevel) {
        if (currentLevel > maxLevel) return;
        
        try {
            // تحميل بيانات المستخدم
            if (!this.userDataCache[userId]) {
                const userSnapshot = await firebase.database().ref('users/' + userId).once('value');
                this.userDataCache[userId] = userSnapshot.val();
            }
            
            network[userId] = {
                level: currentLevel,
                data: this.userDataCache[userId],
                referrals: {}
            };
            
            // تحميل الإحالات المباشرة
            const snapshot = await firebase.database().ref('userReferrals/' + userId).once('value');
            if (!snapshot.exists()) return;
            
            const referrals = snapshot.val();
            
            // تحميل الإحالات بشكل متكرر
            for (const referredUserId in referrals) {
                network[userId].referrals[referredUserId] = {
                    data: referrals[referredUserId],
                    level: currentLevel + 1
                };
                
                await this.loadNetworkRecursive(
                    referredUserId, 
                    network[userId].referrals, 
                    currentLevel + 1, 
                    maxLevel
                );
            }
        } catch (error) {
            console.error("Error loading network recursively:", error);
        }
    }

    renderNetwork(network, container) {
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!network || Object.keys(network).length === 0) {
            container.innerHTML = '<div class="empty-state">لا توجد إحالات حتى الآن</div>';
            return;
        }
        
        // البدء من المستخدم الحالي
        this.renderNetworkNode(this.currentUser.uid, network, container, 0);
    }

    renderNetworkNode(userId, network, container, level) {
        if (!network[userId]) return;
        
        const nodeData = network[userId].data;
        const referrals = network[userId].referrals;
        
        const nodeElement = document.createElement('div');
        nodeElement.className = `tree-node level-${level}`;
        
        nodeElement.innerHTML = `
            <div class="node-header">
                <div class="node-user">
                    <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(nodeData.name)}&background=random" alt="صورة المستخدم">
                    <div class="node-details">
                        <div class="node-name">${nodeData.name}</div>
                        <div class="node-email">${nodeData.email}</div>
                    </div>
                </div>
                <div class="node-meta">
                    <span class="node-level">المستوى: ${level}</span>
                    <span class="node-points">${nodeData.points || 0} نقطة</span>
                </div>
                <div class="node-expand">
                    <i class="fas fa-chevron-down"></i>
                </div>
            </div>
        `;
        
        // إذا كان هناك إحالات، إضافة زر للتوسيع
        if (referrals && Object.keys(referrals).length > 0) {
            const expandBtn = nodeElement.querySelector('.node-expand');
            expandBtn.onclick = () => this.toggleNodeExpansion(nodeElement, referrals, level + 1);
        } else {
            const expandBtn = nodeElement.querySelector('.node-expand');
            if (expandBtn) expandBtn.style.display = 'none';
        }
        
        container.appendChild(nodeElement);
    }

    toggleNodeExpansion(node, referrals, level) {
        const expandIcon = node.querySelector('.node-expand i');
        const childrenContainer = node.querySelector('.node-children');
        
        if (childrenContainer) {
            // إذا كان هناك حاوية أطفال بالفعل، قم بالتبديل
            if (childrenContainer.style.display === 'none') {
                childrenContainer.style.display = 'block';
                expandIcon.classList.add('expanded');
            } else {
                childrenContainer.style.display = 'none';
                expandIcon.classList.remove('expanded');
            }
        } else {
            // إذا لم تكن هناك حاوية أطفال، قم بإنشائها وعرضها
            const newChildrenContainer = document.createElement('div');
            newChildrenContainer.className = 'node-children';
            
            for (const referredUserId in referrals) {
                this.renderNetworkNode(referredUserId, referrals, newChildrenContainer, level);
            }
            
            node.appendChild(newChildrenContainer);
            expandIcon.classList.add('expanded');
        }
    }

    async loadManagementData() {
        if (!this.currentUser) return;
        
        try {
            // تحميل جميع أعضاء الشبكة
            await this.loadAllNetworkMembers();
            
            // تطبيق الفلاتر الافتراضية
            this.applyFilters();
            
        } catch (error) {
            console.error("Error loading management data:", error);
        }
    }

    async loadAllNetworkMembers() {
        this.allMembers = [];
        
        // البدء من المستخدم الحالي
        await this.collectNetworkMembers(this.currentUser.uid, 0);
        
        // تخزين نسخة من جميع الأعضاء للتصفية
        this.filteredMembers = [...this.allMembers];
    }

    async collectNetworkMembers(userId, level) {
        try {
            // تحميل بيانات المستخدم
            const userSnapshot = await firebase.database().ref('users/' + userId).once('value');
            const userData = userSnapshot.val();
            
            if (userData) {
                this.allMembers.push({
                    id: userId,
                    ...userData,
                    level: level
                });
            }
            
            // تحميل الإحالات المباشرة
            const referralsSnapshot = await firebase.database().ref('userReferrals/' + userId).once('value');
            if (!referralsSnapshot.exists()) return;
            
            const referrals = referralsSnapshot.val();
            
            // جمع الإحالات بشكل متكرر
            for (const referredUserId in referrals) {
                await this.collectNetworkMembers(referredUserId, level + 1);
            }
        } catch (error) {
            console.error("Error collecting network members:", error);
        }
    }

    applyFilters() {
        const levelFilter = document.getElementById('level-filter') ? document.getElementById('level-filter').value : '';
        const statusFilter = document.getElementById('status-filter') ? document.getElementById('status-filter').value : '';
        const sortFilter = document.getElementById('sort-filter') ? document.getElementById('sort-filter').value : 'joinDate';
        const searchTerm = document.getElementById('member-search') ? document.getElementById('member-search').value.toLowerCase() : '';
        
        // تطبيق الفلاتر
        this.filteredMembers = this.allMembers.filter(member => {
            // تصفية حسب المستوى
            if (levelFilter && member.level != levelFilter) return false;
            
            // تصفية حسب الحالة
            if (statusFilter && member.status !== statusFilter) return false;
            
            // تصفية حسب البحث
            if (searchTerm && !member.name.toLowerCase().includes(searchTerm) && !member.email.toLowerCase().includes(searchTerm)) return false;
            
            return true;
        });
        
        // التصنيف
        this.filteredMembers.sort((a, b) => {
            if (sortFilter === 'name') return a.name.localeCompare(b.name);
            if (sortFilter === 'points') return (b.points || 0) - (a.points || 0);
            if (sortFilter === 'level') return a.level - b.level;
            // افتراضي: تاريخ الانضمام
            return new Date(b.joinDate) - new Date(a.joinDate);
        });
        
        // حساب عدد الصفحات
        this.totalPages = Math.ceil(this.filteredMembers.length / this.pageSize);
        const totalPagesEl = document.getElementById('total-pages');
        if (totalPagesEl) totalPagesEl.textContent = this.totalPages;
        
        // عرض الصفحة الحالية
        this.showCurrentPage();
    }

    showCurrentPage() {
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = startIndex + this.pageSize;
        const pageMembers = this.filteredMembers.slice(startIndex, endIndex);
        
        const membersTable = document.getElementById('network-members');
        if (!membersTable) return;
        
        membersTable.innerHTML = '';
        
        if (pageMembers.length === 0) {
            membersTable.innerHTML = '<tr><td colspan="9" style="text-align: center;">لا توجد نتائج</td></tr>';
            return;
        }
        
        pageMembers.forEach(async (member) => {
            const row = membersTable.insertRow();
            const referralsCount = await this.loadReferralsCount(member.id);
            
            row.innerHTML = `
                <td>
                    <input type="checkbox" class="member-checkbox" data-id="${member.id}">
                </td>
                <td>${member.name}</td>
                <td>${member.email}</td>
                <td><span class="user-badge level-${member.level}">مستوى ${member.level}</span></td>
                <td>${new Date(member.joinDate).toLocaleDateString('ar-SA')}</td>
                <td>${member.points || 0}</td>
                <td>${referralsCount}</td>
                <td><span class="status-${member.status || 'active'}">${this.getStatusText(member.status || 'active')}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn btn-view" onclick="app.viewMember('${member.id}')" title="عرض"><i class="fas fa-eye"></i></button>
                        <button class="action-btn btn-message" onclick="app.sendMessage('${member.id}', '${member.email}')" title="رسالة"><i class="fas fa-envelope"></i></button>
                        <button class="action-btn btn-edit" onclick="app.editMember('${member.id}')" title="تعديل"><i class="fas fa-edit"></i></button>
                        <button class="action-btn btn-deactivate" onclick="app.toggleStatus('${member.id}', '${member.status || 'active'}')" title="تفعيل/إيقاف">
                            <i class="fas ${member.status === 'active' ? 'fa-user-times' : 'fa-user-check'}"></i>
                        </button>
                    </div>
                </td>
            `;
        });
        
        // تحديث معلومات الصفحة
        const currentPageEl = document.getElementById('current-page');
        if (currentPageEl) currentPageEl.textContent = this.currentPage;
    }

    getStatusText(status) {
        const statusMap = {
            'active': 'نشط',
            'inactive': 'غير نشط',
            'suspended': 'موقوف'
        };
        return statusMap[status] || 'نشط';
    }

    updateNetworkStats() {
        if (!this.networkData) return;
        
        // حساب الإحصائيات
        let totalMembers = 0;
        let maxLevel = 0;
        let totalPoints = 0;
        
        const countStats = (node, level) => {
            totalMembers++;
            totalPoints += node.data.points || 0;
            maxLevel = Math.max(maxLevel, level);
            
            if (node.referrals) {
                for (const refId in node.referrals) {
                    countStats(node.referrals[refId], level + 1);
                }
            }
        };
        
        countStats(this.networkData[this.currentUser.uid], 0);
        
        // تحديث واجهة المستخدم
        const totalMembersEl = document.getElementById('total-members');
        const totalLevelsEl = document.getElementById('total-levels');
        const activeMembersEl = document.getElementById('active-members');
        const totalPointsEl = document.getElementById('total-points');
        
        if (totalMembersEl) totalMembersEl.textContent = totalMembers;
        if (totalLevelsEl) totalLevelsEl.textContent = maxLevel;
        if (activeMembersEl) activeMembersEl.textContent = totalMembers; // يمكن تحسين هذا ليتتبع النشاط الفعلي
        if (totalPointsEl) totalPointsEl.textContent = totalPoints;
    }

    // وظائف الإدارة
    viewMember(userId) {
        alert(`عرض تفاصيل العضو: ${userId}`);
        // يمكن تنفيذ عرض التفاصيل هنا
    }

    sendMessage(userId, email) {
        const message = prompt(`أدخل الرسالة التي تريد إرسالها إلى ${email}:`);
        if (message) {
            alert(`سيتم إرسال الرسالة إلى ${email}: ${message}`);
            // تنفيذ إرسال الرسالة هنا
        }
    }

    editMember(userId) {
        alert(`فتح نافذة تعديل العضو: ${userId}`);
        // تنفيذ التعديل هنا
    }

    async toggleStatus(userId, currentStatus) {
        const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
        const confirm = window.confirm(`هل تريد ${newStatus === 'active' ? 'تفعيل' : 'إيقاف'} هذا العضو؟`);
        
        if (confirm) {
            try {
                await firebase.database().ref('users/' + userId + '/status').set(newStatus);
                alert(`تم ${newStatus === 'active' ? 'تفعيل' : 'إيقاف'} العضو بنجاح`);
                this.loadManagementData(); // إعادة تحميل البيانات
            } catch (error) {
                console.error("Error updating status:", error);
                alert("فشل في تحديث حالة العضو");
            }
        }
    }

    // وظائف التصفية والترتيب
    async searchMembers() {
        this.applyFilters();
    }

    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.showCurrentPage();
        }
    }

    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.showCurrentPage();
        }
    }

    selectAll() {
        const selectAll = document.getElementById('select-all');
        const checkboxes = document.querySelectorAll('.member-checkbox');
        
        checkboxes.forEach(checkbox => {
            checkbox.checked = selectAll.checked;
        });
    }

    // وظائف الشبكة
    expandAll() {
        const expandButtons = document.querySelectorAll('.node-expand');
        expandButtons.forEach(btn => {
            if (btn.querySelector('i').classList.contains('fa-chevron-down')) {
                btn.click();
            }
        });
    }

    collapseAll() {
        const collapseButtons = document.querySelectorAll('.node-expand');
        collapseButtons.forEach(btn => {
            if (btn.querySelector('i').classList.contains('fa-chevron-up')) {
                btn.click();
            }
        });
    }

    // وظائف مساعدة
    generateReferralCode() {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 8; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    }

    async getUserIdFromReferralCode(referralCode) {
        try {
            const snapshot = await firebase.database().ref('referralCodes/' + referralCode).once('value');
            return snapshot.val();
        } catch (error) {
            console.error("Error getting user ID from referral code:", error);
            return null;
        }
    }

    async updateReferrerStats(referrerId) {
        try {
            // حساب عدد الإحالات الكلي
            const snapshot = await firebase.database().ref('userReferrals/' + referrerId).once('value');
            const referralsCount = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
            
            // تحديث عدد الإحالات
            await firebase.database().ref('users/' + referrerId + '/referralsCount').set(referralsCount);
            
        } catch (error) {
            console.error("Error updating referrer stats:", error);
        }
    }

    copyReferralLink() {
        const referralLink = document.getElementById('referral-link');
        if (!referralLink) return;
        
        referralLink.select();
        document.execCommand('copy');
        alert('تم نسخ رابط الإحالة!');
    }

    shareOnFacebook() {
        const referralLink = document.getElementById('referral-link');
        if (!referralLink) return;
        
        const url = encodeURIComponent(referralLink.value);
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
    }

    shareOnTwitter() {
        const referralLink = document.getElementById('referral-link');
        if (!referralLink) return;
        
        const text = encodeURIComponent('انضم إلى هذا الموقع الرائع عبر رابط الإحالة الخاص بي!');
        const url = encodeURIComponent(referralLink.value);
        window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
    }

    shareOnWhatsApp() {
        const referralLink = document.getElementById('referral-link');
        if (!referralLink) return;
        
        const text = encodeURIComponent('انضم إلى هذا الموقع الرائع عبر رابط الإحالة الخاص بي: ');
        const url = encodeURIComponent(referralLink.value);
        window.open(`https://wa.me/?text=${text}${url}`, '_blank');
    }

    updateAuthUI(isLoggedIn) {
        const authElements = document.querySelectorAll('.auth-only');
        const unauthElements = document.querySelectorAll('.unauth-only');
        
        if (isLoggedIn) {
            authElements.forEach(el => {
                if (el) el.style.display = 'block';
            });
            unauthElements.forEach(el => {
                if (el) el.style.display = 'none';
            });
        } else {
            authElements.forEach(el => {
                if (el) el.style.display = 'none';
            });
            unauthElements.forEach(el => {
                if (el) el.style.display = 'block';
            });
        }
    }

    async handleLogout() {
        try {
            await firebase.auth().signOut();
            window.location.href = 'index.html';
        } catch (error) {
            console.error("Error signing out:", error);
        }
    }

    showAlert(element, type, message) {
        if (!element) return;
        
        element.textContent = message;
        element.className = `alert alert-${type}`;
        element.style.display = 'block';
        
        setTimeout(() => {
            element.style.display = 'none';
        }, 3000);
    }

    showGlobalAlert(type, message) {
        // إنشاء عنصر تنبيه إذا لم يكن موجودًا
        let alertEl = document.getElementById('global-alert');
        if (!alertEl) {
            alertEl = document.createElement('div');
            alertEl.id = 'global-alert';
            alertEl.style.position = 'fixed';
            alertEl.style.top = '20px';
            alertEl.style.right = '20px';
            alertEl.style.left = '20px';
            alertEl.style.zIndex = '10000';
            alertEl.style.maxWidth = '500px';
            alertEl.style.margin = '0 auto';
            document.body.appendChild(alertEl);
        }
        
        // تعيين المحتوى والنمط
        alertEl.innerHTML = `
            <div class="alert alert-${type}" style="margin: 0;">
                ${message}
                <button onclick="this.parentElement.style.display='none'" style="float: left; background: none; border: none; cursor: pointer;">×</button>
            </div>
        `;
        alertEl.style.display = 'block';
        
        // إخفاء التنبيه بعد 5 ثوان
        setTimeout(() => {
            alertEl.style.display = 'none';
        }, 5000);
    }

    // وظائف الإجراءات الجماعية
    sendBulkMessage() {
        const selectedMembers = this.getSelectedMembers();
        if (selectedMembers.length === 0) {
            alert('يرجى تحديد أعضاء على الأقل');
            return;
        }
        
        const message = prompt('أدخل الرسالة التي تريد إرسالها للأعضاء المحددين:');
        if (message) {
            alert(`سيتم إرسال الرسالة إلى ${selectedMembers.length} عضو: ${message}`);
            // تنفيذ إرسال الرسالة هنا
        }
    }

    exportData() {
        const selectedMembers = this.getSelectedMembers();
        const membersToExport = selectedMembers.length > 0 ? selectedMembers : this.filteredMembers;
        
        if (membersToExport.length === 0) {
            alert('لا توجد بيانات للتصدير');
            return;
        }
        
        alert(`سيتم تصدير بيانات ${membersToExport.length} عضو`);
        // تنفيذ التصدير هنا
    }

    managePoints() {
        const selectedMembers = this.getSelectedMembers();
        if (selectedMembers.length === 0) {
            alert('يرجى تحديد أعضاء على الأقل');
            return;
        }
        
        const points = prompt('أدخل عدد النقاط التي تريد منحها/سحبها:');
        if (points) {
            const action = confirm('هل تريد منح هذه النقاط؟ (موافق للمنح، إلغاء للسحب)');
            alert(`سيتم ${action ? 'منح' : 'سحب'} ${points} نقطة لـ ${selectedMembers.length} عضو`);
            // تنفيذ إدارة النقاط هنا
        }
    }

    managePermissions() {
        alert('فتح نافذة إدارة الصلاحيات');
        // تنفيذ إدارة الصلاحيات هنا
    }

    getSelectedMembers() {
        const selected = [];
        const checkboxes = document.querySelectorAll('.member-checkbox:checked');
        
        checkboxes.forEach(checkbox => {
            const memberId = checkbox.getAttribute('data-id');
            const member = this.filteredMembers.find(m => m.id === memberId);
            if (member) selected.push(member);
        });
        
        return selected;
    }

    exportSelected() {
        const selectedMembers = this.getSelectedMembers();
        if (selectedMembers.length === 0) {
            alert('يرجى تحديد أعضاء على الأقل');
            return;
        }
        
        alert(`سيتم تصدير بيانات ${selectedMembers.length} عضو`);
        // تنفيذ التصدير هنا
    }

    refreshData() {
        this.loadManagementData();
    }

    applyBulkAction() {
        const action = document.getElementById('bulk-action');
        if (!action) return;
        
        const actionValue = action.value;
        const selectedMembers = this.getSelectedMembers();
        
        if (selectedMembers.length === 0) {
            alert('يرجى تحديد أعضاء على الأقل');
            return;
        }
        
        switch (actionValue) {
            case 'message':
                this.sendBulkMessage();
                break;
            case 'addPoints':
                this.managePoints();
                break;
            case 'removePoints':
                this.managePoints();
                break;
            case 'changeStatus':
                this.bulkChangeStatus();
                break;
            default:
                alert('يرجى اختيار إجراء');
        }
    }

    bulkChangeStatus() {
        const selectedMembers = this.getSelectedMembers();
        const newStatus = prompt('أدخل الحالة الجديدة (active/inactive/suspended):');
        
        if (newStatus && ['active', 'inactive', 'suspended'].includes(newStatus)) {
            alert(`سيتم تغيير حالة ${selectedMembers.length} عضو إلى ${newStatus}`);
            // تنفيذ تغيير الحالة هنا
        } else {
            alert('الحالة غير صالحة. يجب أن تكون active أو inactive أو suspended');
        }
    }
}

// تهيئة التطبيق بعد تحميل DOM
document.addEventListener('DOMContentLoaded', function() {
    // التحقق من تحميل Firebase أولاً
    if (typeof firebase === 'undefined') {
        console.error("Firebase is not loaded");
        alert("لم يتم تحميل Firebase. يرجى التحقق من اتصال الإنترنت وتحديث الصفحة.");
        return;
    }
    
    try {
        window.app = new ReferralSystem();
    } catch (error) {
        console.error("App initialization error:", error);
        alert("حدث خطأ في تهيئة التطبيق: " + error.message);
    }
});
