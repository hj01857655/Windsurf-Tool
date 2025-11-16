// domainManager.js - 邮箱域名管理模块
// 使用全局的 ConfigManager (通过 window.ConfigManager 访问)

/**
 * 邮箱域名管理器
 */
const DomainManager = {
  // 当前域名列表
  domains: [],
  
  /**
   * 初始化 - 从配置文件加载域名
   */
  async init() {
    try {
      const result = await window.ConfigManager.loadConfig();
      if (result.success && result.config) {
        this.domains = result.config.emailDomains || [];
        this.renderDomains();
        console.log('✅ 域名列表加载成功:', this.domains);
      } else {
        console.warn('⚠️ 加载配置失败，使用空域名列表');
        this.domains = [];
        this.renderDomains();
      }
    } catch (error) {
      console.error('❌ 初始化域名管理器失败:', error);
      this.domains = [];
      this.renderDomains();
    }
  },
  
  /**
   * 验证域名格式
   */
  validateDomain(domain) {
    // 移除空格
    domain = domain.trim();
    
    // 基本格式验证
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
    
    if (!domainRegex.test(domain)) {
      return { valid: false, message: '域名格式不正确' };
    }
    
    // 检查是否已存在
    if (this.domains.includes(domain)) {
      return { valid: false, message: '该域名已存在' };
    }
    
    return { valid: true, domain };
  },
  
  /**
   * 添加域名
   */
  async addDomain(domain) {
    if (!domain) {
      return { success: false, message: '域名不能为空' };
    }
    
    // 验证域名
    const validation = this.validateDomain(domain);
    if (!validation.valid) {
      return { success: false, message: validation.message };
    }
    
    // 添加到列表
    this.domains.push(validation.domain);
    
    // 保存到配置文件
    const saveResult = await this.saveDomains();
    if (saveResult.success) {
      this.renderDomains();
      console.log('✅ 域名添加成功:', validation.domain);
      return { success: true, domain: validation.domain };
    } else {
      // 保存失败，回滚
      this.domains.pop();
      return { success: false, message: '保存失败: ' + saveResult.message };
    }
  },
  
  /**
   * 删除域名
   */
  async removeDomain(domain) {
    const index = this.domains.indexOf(domain);
    if (index === -1) {
      return { success: false, message: '域名不存在' };
    }
    
    // 从列表中移除
    this.domains.splice(index, 1);
    
    // 保存到配置文件
    const saveResult = await this.saveDomains();
    if (saveResult.success) {
      this.renderDomains();
      console.log('✅ 域名删除成功:', domain);
      return { success: true };
    } else {
      // 保存失败，回滚
      this.domains.splice(index, 0, domain);
      return { success: false, message: '保存失败: ' + saveResult.message };
    }
  },
  
  /**
   * 保存域名到配置文件
   */
  async saveDomains() {
    try {
      const result = await window.ConfigManager.loadConfig();
      if (result.success && result.config) {
        const config = result.config;
        config.emailDomains = this.domains;
        
        const saveResult = await window.ConfigManager.saveConfig(config);
        return saveResult;
      } else {
        return { success: false, message: '加载配置失败' };
      }
    } catch (error) {
      console.error('❌ 保存域名失败:', error);
      return { success: false, message: error.message };
    }
  },
  
  /**
   * 渲染域名标签
   */
  renderDomains() {
    const container = document.getElementById('domainTags');
    const countEl = document.getElementById('domainCount');
    const emptyHint = document.getElementById('emptyDomainHint');
    
    if (!container) return;
    
    // 更新计数
    if (countEl) {
      countEl.textContent = this.domains.length;
    }
    
    // 清空容器
    container.innerHTML = '';
    
    if (this.domains.length === 0) {
      // 显示空状态提示
      container.innerHTML = `
        <div style="width: 100%; text-align: center; color: #86868b; font-size: 12px; padding: 20px 0;" id="emptyDomainHint">
          <i data-lucide="inbox" style="width: 24px; height: 24px; margin-bottom: 8px;"></i>
          <div>暂无配置的域名</div>
        </div>
      `;
    } else {
      // 渲染域名标签
      this.domains.forEach(domain => {
        const tag = document.createElement('div');
        tag.className = 'domain-tag';
        tag.style.cssText = `
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: #f5f5f7;
          color: #1d1d1f;
          border: 1px solid #d1d1d6;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 400;
        `;
        
        tag.innerHTML = `
          <span>${domain}</span>
          <button 
            onclick="removeDomainByClick('${domain}')" 
            style="background: transparent; border: none; color: #86868b; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; transition: all 0.2s ease;"
            onmouseover="this.style.color='#ff3b30'"
            onmouseout="this.style.color='#86868b'"
            title="删除域名">
            <i data-lucide="x" style="width: 12px; height: 12px;"></i>
          </button>
        `;
        
        container.appendChild(tag);
      });
    }
    
    // 重新初始化图标
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
};

// 全局函数（用于HTML调用）
async function initDomainManager() {
  await DomainManager.init();
}

function handleDomainInputKeyPress(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    addDomain();
  }
}

async function addDomain() {
  try {
    console.log('🔍 开始添加域名...');
    
    // 等待 DOM 完全加载
    if (document.readyState !== 'complete') {
      console.warn('⚠️ DOM 未完全加载，等待中...');
      await new Promise(resolve => {
        if (document.readyState === 'complete') {
          resolve();
        } else {
          window.addEventListener('load', resolve, { once: true });
        }
      });
    }
    
    const input = document.getElementById('domainInput');
    console.log('🔍 输入框元素:', input);
    
    if (!input) {
      console.error('❌ 找不到域名输入框元素 (ID: domainInput)');
      console.error('📋 当前 DOM 状态:', document.readyState);
      console.error('📋 body 存在:', !!document.body);
      alert('系统错误：找不到输入框\n请刷新页面后重试');
      return;
    }
    
    const domain = input.value ? input.value.trim() : '';
    console.log('🔍 输入的域名:', domain);
    
    if (!domain) {
      alert('请输入域名');
      input.focus();
      return;
    }
    
    console.log('📤 正在添加域名:', domain);
    const result = await DomainManager.addDomain(domain);
    console.log('📥 添加结果:', result);
    
    if (result.success) {
      input.value = '';
      input.focus();
      console.log('✅ 域名添加成功');
    } else {
      alert(result.message || '添加域名失败');
      console.error('❌ 添加失败:', result.message);
    }
  } catch (error) {
    console.error('❌ 添加域名时发生错误:', error);
    console.error('错误堆栈:', error.stack);
    alert('发生错误: ' + error.message + '\n请查看控制台了解详情');
  }
}

async function removeDomainByClick(domain) {
  if (!confirm(`确定要删除域名 "${domain}" 吗？`)) {
    return;
  }
  
  const result = await DomainManager.removeDomain(domain);
  if (!result.success) {
    alert(result.message);
  }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DomainManager;
}
