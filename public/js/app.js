/* ============================================
   主持与戏剧表演队 — 朋友圈式交互
   ============================================ */

let currentUser = null;
let currentPage = 'memories';
let lightboxPhotos = [];
let lightboxIndex = 0;

// ==================== Init ====================
document.addEventListener('DOMContentLoaded', async () => {
  try { const r = await API.me(); currentUser = r.user; } catch(e) {}
  initNav();
  switchPage('memories');
});

// ==================== Navigation ====================
function initNav() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchPage(tab.dataset.page));
  });
}
function switchPage(page) {
  currentPage = page;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  const oldFab = document.getElementById('fab'); if (oldFab) oldFab.remove();
  if (page === 'memories') renderMemories();
  else if (page === 'members') renderMembers();
  else if (page === 'my') renderMy();
}

// ==================== Toast ====================
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 2000);
}

// ==================== Modal ====================
function showModal(html) { document.getElementById('modalContent').innerHTML = html; document.getElementById('modal').classList.add('show'); }
function closeModal() { document.getElementById('modal').classList.remove('show'); }
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalBackdrop').addEventListener('click', closeModal);

// ==================== Lightbox ====================
function openLightbox(photos, index) { lightboxPhotos = photos; lightboxIndex = index; showLightboxImage(); document.getElementById('lightbox').classList.add('show'); }
function closeLightbox() { document.getElementById('lightbox').classList.remove('show'); }
function showLightboxImage() {
  const p = lightboxPhotos[lightboxIndex];
  document.getElementById('lightboxImg').src = p.src || '/uploads/' + p.filename;
  document.getElementById('lightboxCaption').textContent = p.title || '';
}
document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
document.getElementById('lightbox').addEventListener('click', e => { if (e.target === e.currentTarget) closeLightbox(); });
document.getElementById('lightboxPrev').addEventListener('click', () => { lightboxIndex = (lightboxIndex - 1 + lightboxPhotos.length) % lightboxPhotos.length; showLightboxImage(); });
document.getElementById('lightboxNext').addEventListener('click', () => { lightboxIndex = (lightboxIndex + 1) % lightboxPhotos.length; showLightboxImage(); });
document.addEventListener('keydown', e => {
  if (!document.getElementById('lightbox').classList.contains('show')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') { lightboxIndex = (lightboxIndex - 1 + lightboxPhotos.length) % lightboxPhotos.length; showLightboxImage(); }
  if (e.key === 'ArrowRight') { lightboxIndex = (lightboxIndex + 1) % lightboxPhotos.length; showLightboxImage(); }
});

// ==================== Like Btn ====================
function makeLikeBtn(targetType, targetId) {
  const btn = document.createElement('button');
  btn.className = 'action-btn';
  btn.innerHTML = '❤️ <span>0</span>';
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!currentUser) { toast('请先登录'); return; }
    try {
      const r = await API.toggleLike({ target_type: targetType, target_id: targetId });
      btn.classList.toggle('liked', r.liked);
      btn.querySelector('span').textContent = r.count;
    } catch(e) { toast(e.message); }
  });
  if (currentUser) {
    API.getLikes({ target_type: targetType, target_id: targetId, user_id: currentUser.id })
      .then(r => { btn.classList.toggle('liked', r.liked); btn.querySelector('span').textContent = r.count; })
      .catch(() => {});
  }
  return btn;
}

// ==================== Comments ====================
function makeCommentsSection(targetType, targetId) {
  const wrap = document.createElement('div'); wrap.className = 'comments-section';
  const list = document.createElement('div'); list.className = 'comments-list'; wrap.appendChild(list);
  const inputWrap = document.createElement('div'); inputWrap.className = 'comment-input-wrap';
  const input = document.createElement('input'); input.placeholder = '写评论...';
  const sendBtn = document.createElement('button'); sendBtn.textContent = '发送';
  sendBtn.addEventListener('click', async () => {
    if (!currentUser) { toast('请先登录'); return; }
    const content = input.value.trim(); if (!content) return;
    try { await API.postComment({ target_type: targetType, target_id: targetId, content }); input.value = ''; loadComments(targetType, targetId, list); } catch(e) { toast(e.message); }
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') sendBtn.click(); });
  inputWrap.appendChild(input); inputWrap.appendChild(sendBtn); wrap.appendChild(inputWrap);
  loadComments(targetType, targetId, list);
  return wrap;
}
async function loadComments(targetType, targetId, listEl) {
  try {
    const r = await API.getComments({ target_type: targetType, target_id: targetId });
    listEl.innerHTML = r.comments.map(c => `
      <div class="comment-item"><span class="comment-author">${esc(c.user_name)}</span>${esc(c.content)}<span class="comment-time">${fmtTime(c.created_at)}</span>${(currentUser&&(currentUser.is_admin||currentUser.id===c.user_id))?'<button class="cmt-del" data-cid="'+c.id+'">🗑</button>':''}</div>
    `).join('');
    listEl.querySelectorAll('.cmt-del').forEach(b => b.addEventListener('click', async e => { e.stopPropagation(); try { await API.deleteComment(b.dataset.cid); loadComments(targetType, targetId, listEl); } catch(err) { toast(err.message); } }));
  } catch(e) { listEl.innerHTML = ''; }
}

// ==================== Feed Card (朋友圈风格) ====================
function makeFeedCard(p, photoList, idx) {
  const avatarUrl = p.avatar ? '/uploads/'+p.avatar+'?t='+p.user_id : '';
  const avatarHtml = avatarUrl ? '<img src="'+avatarUrl+'" class="feed-avatar">' : '<div class="feed-avatar" style="background:var(--gold-light);display:flex;align-items:center;justify-content:center;font-size:1.2rem;">👤</div>';
  const canDelete = currentUser && (currentUser.is_admin || currentUser.id === p.user_id);

  return `
    <div class="feed-card">
      <div class="feed-header">
        ${avatarHtml}
        <div class="feed-user-info">
          <div class="feed-user-name">${esc(p.user_name||'未知')}${p.title?' <span class="feed-title-tag">'+esc(p.title)+'</span>':''}</div>
          <div class="feed-time">${fmtTime(p.created_at)}</div>
        </div>
        ${canDelete ? '<button class="feed-del" data-pid="'+p.id+'" title="删除">🗑</button>' : ''}
      </div>
      <div class="feed-photo" data-idx="'+idx+'">
        <img src="/uploads/'+p.filename+'" alt="" loading="lazy">
      </div>
      ${p.title ? '<div class="feed-caption">'+esc(p.title)+'</div>' : ''}
      <div class="feed-actions">
        <div class="action-bar" id="action-photo-'+p.id+'"></div>
      </div>
      <div id="comments-photo-'+p.id+'"></div>
    </div>
  `;
}

// ==================== PAGE: 主持记忆 (朋友圈Feed) ====================
async function renderMemories() {
  const el = document.getElementById('memoriesContent');
  el.innerHTML = '<p style="text-align:center;color:var(--text-light);padding:24px;">加载中...</p>';

  // Everyone can post — add FAB
  if (currentUser) {
    const fab = document.createElement('button'); fab.id = 'fab'; fab.className = 'fab'; fab.textContent = '📷';
    fab.addEventListener('click', showFeedUpload);
    document.body.appendChild(fab);
  }

  try {
    const [photosRes, eventsRes] = await Promise.all([API.getPhotos(), API.getEvents()]);
    const photos = photosRes.photos;
    const events = eventsRes.events;

    let html = '';

    // Feed photos
    if (photos.length === 0) {
      html += '<div class="feed-empty">📷<p>还没有动态，快来发第一条吧~</p></div>';
    } else {
      const photoList = photos.map(p => ({ src: '/uploads/'+p.filename, title: p.title }));
      photos.forEach((p, i) => { html += makeFeedCard(p, photoList, i); });
    }

    // Events section
    if (events.length > 0) {
      html += '<h3 style="margin:16px 0 8px;color:var(--brown);padding:0 4px;">📅 活动记录</h3>';
      events.forEach(ev => {
        html += '<div class="event-card" id="event-'+ev.id+'">'
              + '<span class="event-year">'+esc(ev.date.slice(0,4))+'</span>'
              + (ev.image ? '<img src="/uploads/'+ev.image+'" style="width:100%;max-height:300px;object-fit:cover;border-radius:8px;margin:8px 0;">' : '')
              + '<div class="event-title">'+esc(ev.title)+'</div>'
              + '<div class="event-meta">📅 '+esc(ev.date)+(ev.location?' 📍 '+esc(ev.location):'')+'</div>'
              + '<div class="event-desc">'+esc(ev.description||'')+'</div>'
              + '<div class="action-bar" id="action-event-'+ev.id+'"></div>'
              + '<div id="comments-event-'+ev.id+'"></div></div>';
      });
    }

    // Admin panel
    if (currentUser && currentUser.is_admin) {
      html += '<div class="admin-panel" style="margin-top:16px;">'
            + '<h3>🔧 管理操作</h3>'
            + '<button class="btn btn-outline btn-sm" id="btnAddEvent">+ 添加活动</button> '
            + '<button class="btn btn-outline btn-sm" id="btnImportRoster">📋 导入名单</button> '
            + '<button class="btn btn-outline btn-sm" id="btnViewInvites">🔑 邀请码</button> '
            + '<button class="btn btn-danger btn-sm" id="btnClearPhotos">🗑 清除照片</button>'
            + '</div>';
    }

    el.innerHTML = html;

    // Photo click → lightbox
    const photoCards = el.querySelectorAll('.feed-photo');
    if (photoCards.length) {
      const srcList = photos.map(p => ({ src: '/uploads/'+p.filename, title: p.title }));
      photoCards.forEach(card => {
        card.addEventListener('click', () => openLightbox(srcList, parseInt(card.dataset.idx)));
      });
    }

    // Delete buttons
    el.querySelectorAll('.feed-del').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('确定删除这条动态吗？')) return;
        try { await API.deletePhoto(btn.dataset.pid); toast('已删除'); renderMemories(); } catch(err) { toast(err.message); }
      });
    });

    // Like + comment per photo
    photos.forEach(p => {
      const a = document.getElementById('action-photo-'+p.id);
      if (a) a.appendChild(makeLikeBtn('photo', p.id));
      const c = document.getElementById('comments-photo-'+p.id);
      if (c) c.appendChild(makeCommentsSection('photo', p.id));
    });
    // Like + comment per event
    events.forEach(ev => {
      const a = document.getElementById('action-event-'+ev.id);
      if (a) a.appendChild(makeLikeBtn('event', ev.id));
      const c = document.getElementById('comments-event-'+ev.id);
      if (c) c.appendChild(makeCommentsSection('event', ev.id));
    });

    // Admin buttons
    if (currentUser && currentUser.is_admin) {
      document.getElementById('btnAddEvent')?.addEventListener('click', showAddEvent);
      document.getElementById('btnImportRoster')?.addEventListener('click', showImportRoster);
      document.getElementById('btnViewInvites')?.addEventListener('click', showInviteCodes);
      document.getElementById('btnClearPhotos')?.addEventListener('click', async () => {
        if (!confirm('确定清除所有照片和头像吗？此操作不可恢复！')) return;
        try { await API.request('DELETE', '/api/photos'); toast('已清除所有照片和头像'); renderMemories(); } catch(err) { toast(err.message); }
      });
    }
  } catch(e) {
    el.innerHTML = '<p style="text-align:center;color:var(--red);padding:20px;">加载失败</p>';
  }
}

// ==================== Feed Upload (朋友圈发照片) ====================
function showFeedUpload() {
  showModal(`
    <h2>📷 发动态</h2>
    <form id="feedUploadForm">
      <div class="form-group"><label>选择照片*</label><input type="file" name="photo" accept="image/*" required></div>
      <div class="form-group"><label>说点什么...（支持emoji）</label><textarea name="title" rows="3" placeholder="这一刻的想法... 😊🎭✨"></textarea></div>
      <button type="submit" class="btn btn-primary" style="width:100%;">发布</button>
    </form>
  `);
  document.getElementById('feedUploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try { await API.uploadPhoto(fd); toast('发布成功！'); closeModal(); renderMemories(); } catch(err) { toast(err.message); }
  });
}

// ==================== Add Event ====================
function showAddEvent() {
  showModal(`
    <h2>📅 添加活动</h2>
    <form id="eventForm" enctype="multipart/form-data">
      <div class="form-group"><label>活动标题*</label><input type="text" name="title" required></div>
      <div class="form-group"><label>日期*</label><input type="date" name="date" required></div>
      <div class="form-group"><label>地点</label><input type="text" name="location"></div>
      <div class="form-group"><label>描述</label><textarea name="description" rows="2"></textarea></div>
      <div class="form-group"><label>配图（可选）</label><input type="file" name="image" accept="image/*"></div>
      <button type="submit" class="btn btn-primary" style="width:100%;">添加</button>
    </form>
  `);
  document.getElementById('eventForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try { const res = await fetch('/api/events', { method:'POST', body:fd }); const d = await res.json(); if (!res.ok) throw new Error(d.error||'失败'); toast('活动已添加！'); closeModal(); renderMemories(); } catch(err) { toast(err.message); }
  });
}

// ==================== Import Roster ====================
function showImportRoster() {
  showModal(`
    <h2>📋 导入队员名单</h2>
    <p style="font-size:0.85rem;color:var(--text-light);margin-bottom:12px;">每行一个：<b>姓名 班级</b></p>
    <form id="importForm"><div class="form-group"><textarea name="names" rows="6" placeholder="张三 计算机2201&#10;李四 软件2202"></textarea></div><button type="submit" class="btn btn-primary" style="width:100%;">导入并生成邀请码</button></form>
    <div id="importResults" style="margin-top:12px;"></div>
  `);
  document.getElementById('importForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await API.importRoster(e.target.names.value);
      document.getElementById('importResults').innerHTML = '<p style="color:green;margin-bottom:8px;">✅ 导入完成！</p>' + r.results.map(x => '<div class="invite-item"><span>'+esc(x.name)+(x.className?' ('+esc(x.className)+')':'')+(x.skipped?' (已存在)':'')+'</span><span class="invite-code">'+x.inviteCode+'</span></div>').join('');
      toast('导入成功！');
    } catch(err) { toast(err.message); }
  });
}

// ==================== Invite Codes ====================
async function showInviteCodes() {
  try {
    const r = await API.getInvites();
    const lines = [];
    r.users.forEach(u => {
      if (!u.is_admin) lines.push(u.name+'  '+(u.class_name||'')+'  '+(u.password_hash?'':'🔑'+u.invite_code)+'  '+(u.password_hash?'✅已激活':'⏳未激活')+(u.title?'  '+u.title:''));
    });
    const copyText = lines.join('\n');
    const html = r.users.map(u =>
      '<div class="invite-item" style="flex-wrap:wrap;gap:6px;">'
      + '<div style="flex:1;min-width:120px;"><span>'+esc(u.name)+(u.class_name?' <span style="color:var(--gold);font-size:0.78rem;">'+esc(u.class_name)+'</span>':'')+(u.is_admin?' 👑':'')
      + (u.title?' <span class="feed-title-tag" style="font-size:0.7rem;">'+esc(u.title)+'</span>':'')
      + '</span><br><span class="invite-code" style="'+(u.password_hash?'color:#4a8;':'')+'">'+(u.password_hash?'✅ 已激活':'🔑 '+u.invite_code)+'</span></div>'
      + (u.is_admin?'':'<div style="display:flex;align-items:center;gap:4px;"><input class="title-input" data-uid="'+u.id+'" value="'+esc(u.title||'')+'" placeholder="头衔" style="width:80px;padding:4px 8px;border:1px solid var(--gold-light);border-radius:12px;font-size:0.78rem;text-align:center;"><button class="btn btn-primary btn-sm title-save" data-uid="'+u.id+'" style="font-size:0.7rem;padding:4px 8px;">设</button></div>')
      + '</div>'
    ).join('');
    showModal('<h2>🔑 邀请码</h2><button class="btn btn-outline btn-sm" id="btnCopyInvites" style="margin-bottom:10px;width:100%;">📋 一键复制</button><div class="invite-list">'+html+'</div>');
    document.querySelectorAll('.title-save').forEach(btn => btn.addEventListener('click', async () => {
      const uid = btn.dataset.uid;
      const input = document.querySelector('.title-input[data-uid="'+uid+'"]');
      try { await API.setTitle(uid, input.value.trim()); toast('头衔已设置！'); } catch(err) { toast(err.message); }
    }));
    document.getElementById('btnCopyInvites')?.addEventListener('click', () => {
      navigator.clipboard.writeText(copyText).then(() => toast('已复制！')).catch(() => toast('复制失败'));
    });
  } catch(err) { toast(err.message); }
}

// ==================== PAGE: 队员风采 ====================
async function renderMembers() {
  const el = document.getElementById('membersContent');
  el.innerHTML = '<p style="text-align:center;color:var(--text-light);padding:20px;">加载中...</p>';
  try {
    const r = await API.getMembers();
    const members = r.members;
    el.innerHTML = '<div class="member-grid">' + members.map(m => {
      const avatarSrc = m.avatar ? '/uploads/'+m.avatar+'?t='+m.id : '';
      return '<div class="member-card" data-id="'+m.id+'">'
        + (avatarSrc ? '<img class="member-avatar" src="'+avatarSrc+'" loading="lazy">' : '<div style="width:56px;height:56px;border-radius:50%;background:var(--gold-light);margin:0 auto 10px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;">👤</div>')
        + '<div class="member-name">'+esc(m.name)+(m.title?' <span class="feed-title-tag">'+esc(m.title)+'</span>':'')+'</div>'
        + (m.class_name?'<div style="font-size:0.72rem;color:var(--gold);">📚 '+esc(m.class_name)+'</div>':'')
        + '<div class="member-bio">'+esc(m.bio||'这个人很懒，还没写介绍...')+'</div>'
        + '</div>';
    }).join('') + '</div>';
    el.querySelectorAll('.member-card').forEach(card => card.addEventListener('click', () => showMemberDetail(card.dataset.id)));
  } catch(e) { el.innerHTML = '<p style="text-align:center;color:var(--red);padding:20px;">加载失败</p>'; }
}

async function showMemberDetail(memberId) {
  const overlay = document.getElementById('memberDetail');
  const content = document.getElementById('memberDetailContent');
  content.innerHTML = '<p style="text-align:center;padding:20px;">加载中...</p>';
  overlay.classList.add('show');
  try {
    const r = await API.getMember(memberId);
    const m = r.member; const photos = r.photos;
    const avatarSrc = m.avatar ? '/uploads/'+m.avatar+'?t='+Date.now() : '';
    let html = '<div style="text-align:center;">';
    if (avatarSrc) html += '<img src="'+avatarSrc+'" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid var(--gold-light);margin-bottom:8px;">';
    html += '<h2 style="color:var(--brown);">'+esc(m.name)+(m.title?' <span class="feed-title-tag">'+esc(m.title)+'</span>':'')+'</h2>';
    if (m.class_name) html += '<p style="color:var(--gold);font-size:0.9rem;">📚 '+esc(m.class_name)+'</p>';
    html += '<p style="color:var(--text-light);margin-bottom:8px;">'+esc(m.bio||'暂无介绍')+'</p>';
    html += '<div class="action-bar" style="justify-content:center;" id="action-member-'+m.id+'"></div>';
    html += '<div id="comments-member-'+m.id+'"></div></div>';
    if (photos.length > 0) {
      html += '<h4 style="margin:16px 0 8px;">📸 照片</h4><div class="photo-grid">';
      photos.forEach((p,i) => { html += '<div class="photo-card" data-idx="'+i+'"><img src="/uploads/'+p.filename+'" loading="lazy"><div class="photo-info"><div class="photo-title">'+esc(p.title||'')+'</div></div></div>'; });
      html += '</div>';
      photos.forEach(p => { html += '<div class="action-bar" id="action-photo-'+p.id+'"></div><div id="comments-photo-'+p.id+'"></div>'; });
    }
    content.innerHTML = html;
    content.querySelectorAll('.photo-card').forEach(card => {
      card.addEventListener('click', () => openLightbox(photos.map(p=>({src:'/uploads/'+p.filename,title:p.title})), parseInt(card.dataset.idx)));
    });
    const ma = document.getElementById('action-member-'+m.id); if (ma) ma.appendChild(makeLikeBtn('member', m.id));
    const mc = document.getElementById('comments-member-'+m.id); if (mc) mc.appendChild(makeCommentsSection('member', m.id));
    photos.forEach(p => {
      const a = document.getElementById('action-photo-'+p.id); if (a) a.appendChild(makeLikeBtn('photo', p.id));
      const c = document.getElementById('comments-photo-'+p.id); if (c) c.appendChild(makeCommentsSection('photo', p.id));
    });
  } catch(e) { content.innerHTML = '<p style="text-align:center;color:var(--red);">加载失败</p>'; }
}
document.getElementById('closeMemberDetail').addEventListener('click', () => document.getElementById('memberDetail').classList.remove('show'));

// ==================== PAGE: 我的 ====================
async function renderMy() {
  const el = document.getElementById('myContent');
  if (!currentUser) {
    el.innerHTML = '<div class="my-login-prompt"><p>登录后查看个人页面</p><button class="btn btn-primary" id="btnShowLogin">登录</button> <button class="btn btn-outline" id="btnShowRegister">注册</button></div>';
    document.getElementById('btnShowLogin').addEventListener('click', showLogin);
    document.getElementById('btnShowRegister').addEventListener('click', showRegister);
    return;
  }
  try { const r = await API.me(); currentUser = r.user; } catch(e) {}
  const avatarSrc = currentUser.avatar ? '/uploads/'+currentUser.avatar+'?t='+Date.now() : '';
  let html = '<div class="my-profile">';
  html += avatarSrc ? '<img class="my-avatar" src="'+avatarSrc+'">' : '<div style="width:80px;height:80px;border-radius:50%;background:var(--gold-light);margin:0 auto 10px;display:flex;align-items:center;justify-content:center;font-size:2rem;">👤</div>';
  html += '<div class="my-name">'+esc(currentUser.name)+(currentUser.is_admin?' 👑':'')+'</div>';
  if (currentUser.title) html += '<div style="display:inline-block;padding:2px 12px;background:var(--brown);color:#fff;border-radius:12px;font-size:0.78rem;margin-bottom:4px;">'+esc(currentUser.title)+'</div>';
  html += '<div class="my-bio">'+esc(currentUser.bio||'点击下方编辑简介~')+'</div>';
  html += '<button class="btn btn-outline btn-sm" id="btnEditBio">✏️ 编辑简介</button> ';
  html += '<button class="btn btn-outline btn-sm" id="btnUploadAvatar">📷 换头像(1:1)</button> ';
  html += '<button class="btn btn-outline btn-sm" id="btnUploadPhoto">📸 发照片</button> ';
  html += '<button class="btn btn-danger btn-sm" id="btnLogout">退出</button></div>';
  html += '<div class="my-photos"><h3 style="margin-bottom:8px;color:var(--brown);">我的动态</h3><div id="myPhotosGrid">加载中...</div></div>';
  el.innerHTML = html;
  // Load my photos
  try {
    const pr = await API.getUserPhotos(currentUser.id);
    const photos = pr.photos;
    let ph = '';
    if (photos.length === 0) ph = '<p style="text-align:center;color:var(--text-light);padding:16px;">还没有动态</p>';
    else {
      ph = '<div class="photo-grid">';
      photos.forEach((p,i) => { ph += '<div class="photo-card" data-idx="'+i+'"><img src="/uploads/'+p.filename+'" loading="lazy"><div class="photo-info"><div class="photo-title">'+esc(p.title||'')+'</div></div></div>'; });
      ph += '</div>';
      photos.forEach(p => { ph += '<div class="action-bar" id="action-myphoto-'+p.id+'"></div><div id="comments-myphoto-'+p.id+'"></div>'; });
    }
    document.getElementById('myPhotosGrid').innerHTML = ph;
    document.getElementById('myPhotosGrid').querySelectorAll('.photo-card').forEach(card => {
      card.addEventListener('click', () => openLightbox(photos.map(p=>({src:'/uploads/'+p.filename,title:p.title})), parseInt(card.dataset.idx)));
    });
    photos.forEach(p => {
      const a = document.getElementById('action-myphoto-'+p.id); if (a) a.appendChild(makeLikeBtn('photo', p.id));
      const c = document.getElementById('comments-myphoto-'+p.id); if (c) c.appendChild(makeCommentsSection('photo', p.id));
    });
  } catch(e) { document.getElementById('myPhotosGrid').innerHTML = '<p style="color:var(--red);">加载失败</p>'; }
  // Buttons
  document.getElementById('btnEditBio').addEventListener('click', showEditBio);
  document.getElementById('btnUploadAvatar').addEventListener('click', showAvatarCrop);
  document.getElementById('btnUploadPhoto').addEventListener('click', showFeedUpload);
  document.getElementById('btnLogout').addEventListener('click', async () => { await API.logout(); currentUser = null; toast('已退出'); renderMy(); });
}

// ==================== Avatar Crop (1:1 preview) ====================
function showAvatarCrop() {
  showModal(`
    <h2>📷 换头像 (1:1)</h2>
    <p style="font-size:0.8rem;color:var(--text-light);margin-bottom:10px;">选择图片后将自动裁剪为1:1正方形</p>
    <form id="avatarForm">
      <div class="form-group"><label>选择图片</label><input type="file" name="avatar" accept="image/*" required id="avatarInput"></div>
      <div id="avatarPreview" style="width:200px;height:200px;border-radius:12px;overflow:hidden;margin:12px auto;background:var(--cream-dark);display:none;">
        <img id="avatarPreviewImg" style="width:100%;height:100%;object-fit:cover;">
      </div>
      <button type="submit" class="btn btn-primary" style="width:100%;">确认上传</button>
    </form>
  `);
  document.getElementById('avatarInput').addEventListener('change', function() {
    if (this.files[0]) {
      const reader = new FileReader();
      reader.onload = e => {
        document.getElementById('avatarPreviewImg').src = e.target.result;
        document.getElementById('avatarPreview').style.display = 'block';
      };
      reader.readAsDataURL(this.files[0]);
    }
  });
  document.getElementById('avatarForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(); fd.append('avatar', document.getElementById('avatarInput').files[0]);
    try { await API.uploadAvatar(currentUser.id, fd); toast('头像已更新！'); closeModal(); renderMy(); } catch(err) { toast(err.message); }
  });
}

// ==================== Edit Bio ====================
function showEditBio() {
  showModal(`
    <h2>✏️ 编辑简介</h2>
    <form id="bioForm"><div class="form-group"><textarea name="bio" rows="3">${esc(currentUser.bio||'')}</textarea></div><button type="submit" class="btn btn-primary" style="width:100%;">保存</button></form>
  `);
  document.getElementById('bioForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await API.updateMember(currentUser.id, e.target.bio.value); toast('已更新！'); closeModal(); renderMy(); } catch(err) { toast(err.message); }
  });
}

// ==================== Auth Modals ====================
function showLogin() {
  showModal(`
    <h2>🔑 登录</h2>
    <form id="loginForm">
      <div class="form-group"><label>姓名</label><input type="text" name="name" required></div>
      <div class="form-group"><label>密码</label><input type="password" name="password" required></div>
      <button type="submit" class="btn btn-primary" style="width:100%;">登录</button>
      <p style="text-align:center;margin-top:12px;font-size:0.85rem;">没有账号？<a href="#" id="switchToRegister" style="color:var(--brown);">注册</a></p>
    </form>
  `);
  document.getElementById('loginForm').addEventListener('submit', async (e) => { e.preventDefault(); try { const r = await API.login({name:e.target.name.value,password:e.target.password.value}); currentUser = r.user; toast('登录成功！'); closeModal(); renderMy(); } catch(err) { toast(err.message); } });
  document.getElementById('switchToRegister').addEventListener('click', e => { e.preventDefault(); showRegister(); });
}
function showRegister() {
  showModal(`
    <h2>📝 注册</h2>
    <form id="registerForm">
      <div class="form-group"><label>邀请码</label><input type="text" name="inviteCode" required></div>
      <div class="form-group"><label>姓名</label><input type="text" name="name" required></div>
      <div class="form-group"><label>设置密码</label><input type="password" name="password" required placeholder="至少4位"></div>
      <button type="submit" class="btn btn-primary" style="width:100%;">注册</button>
      <p style="text-align:center;margin-top:12px;font-size:0.85rem;">已有账号？<a href="#" id="switchToLogin" style="color:var(--brown);">登录</a></p>
    </form>
  `);
  document.getElementById('registerForm').addEventListener('submit', async (e) => { e.preventDefault(); try { const r = await API.register({inviteCode:e.target.inviteCode.value,name:e.target.name.value,password:e.target.password.value}); currentUser = r.user; toast('注册成功！'); closeModal(); renderMy(); } catch(err) { toast(err.message); } });
  document.getElementById('switchToLogin').addEventListener('click', e => { e.preventDefault(); showLogin(); });
}

// ==================== Utilities ====================
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtTime(iso) {
  const d = new Date(iso); const now = new Date(); const diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff/60000)+'分钟前';
  if (diff < 86400000) return Math.floor(diff/3600000)+'小时前';
  if (diff < 604800000) return Math.floor(diff/86400000)+'天前';
  const y = d.getFullYear(); const mo = String(d.getMonth()+1).padStart(2,'0'); const day = String(d.getDate()).padStart(2,'0');
  const h = String(d.getHours()).padStart(2,'0'); const mi = String(d.getMinutes()).padStart(2,'0');
  return y+'-'+mo+'-'+day+' '+h+':'+mi;
}
