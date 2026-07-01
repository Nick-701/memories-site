/* ============================================
   主持与戏剧表演队 — 前端主逻辑
   ============================================ */

// ==================== Global State ====================
let currentUser = null;
let currentPage = 'memories';
let lightboxPhotos = [];
let lightboxIndex = 0;

// ==================== Init ====================
document.addEventListener('DOMContentLoaded', async () => {
  // Check login state
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

  // Remove old FAB
  const oldFab = document.getElementById('fab');
  if (oldFab) oldFab.remove();

  if (page === 'memories') renderMemories();
  else if (page === 'members') renderMembers();
  else if (page === 'my') renderMy();
}

// ==================== Toast ====================
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2000);
}

// ==================== Modal ====================
function showModal(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modal').classList.add('show');
}
function closeModal() { document.getElementById('modal').classList.remove('show'); }
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalBackdrop').addEventListener('click', closeModal);

// ==================== Lightbox ====================
function openLightbox(photos, index) {
  lightboxPhotos = photos;
  lightboxIndex = index;
  showLightboxImage();
  document.getElementById('lightbox').classList.add('show');
}
function closeLightbox() { document.getElementById('lightbox').classList.remove('show'); }
function showLightboxImage() {
  const p = lightboxPhotos[lightboxIndex];
  document.getElementById('lightboxImg').src = p.src || '/uploads/' + p.filename;
  document.getElementById('lightboxCaption').textContent = p.title || '';
}
document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
document.getElementById('lightbox').addEventListener('click', e => { if (e.target === e.currentTarget) closeLightbox(); });
document.getElementById('lightboxPrev').addEventListener('click', () => {
  lightboxIndex = (lightboxIndex - 1 + lightboxPhotos.length) % lightboxPhotos.length;
  showLightboxImage();
});
document.getElementById('lightboxNext').addEventListener('click', () => {
  lightboxIndex = (lightboxIndex + 1) % lightboxPhotos.length;
  showLightboxImage();
});
document.addEventListener('keydown', e => {
  if (!document.getElementById('lightbox').classList.contains('show')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') { lightboxIndex = (lightboxIndex - 1 + lightboxPhotos.length) % lightboxPhotos.length; showLightboxImage(); }
  if (e.key === 'ArrowRight') { lightboxIndex = (lightboxIndex + 1) % lightboxPhotos.length; showLightboxImage(); }
});

// ==================== Helper: Load likes & comments counts ====================
async function loadLikeCommentCounts(targetType, targetIds) {
  if (!targetIds.length) return {};
  // Like counts
  const likeMap = {};
  const commentMap = {};
  // Batch load is handled server-side for individual views; we load per-item here
  // For simplicity, load all at once
  const unique = [...new Set(targetIds)];
  for (const id of unique) {
    try {
      const l = await API.getLikes({ target_type: targetType, target_id: id });
      likeMap[id] = l.count;
    } catch(e) { likeMap[id] = 0; }
    try {
      const c = await API.getComments({ target_type: targetType, target_id: id });
      commentMap[id] = c.comments.length;
    } catch(e) { commentMap[id] = 0; }
  }
  return { likeMap, commentMap };
}

// ==================== Like Button ====================
function makeLikeBtn(targetType, targetId, initialCount) {
  const btn = document.createElement('button');
  btn.className = 'action-btn';
  btn.innerHTML = '❤️ <span>' + (initialCount || 0) + '</span>';
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!currentUser) { toast('请先登录'); return; }
    try {
      const r = await API.toggleLike({ target_type: targetType, target_id: targetId });
      btn.classList.toggle('liked', r.liked);
      btn.querySelector('span').textContent = r.count;
    } catch(e) { toast(e.message); }
  });
  // Check initial state
  if (currentUser) {
    API.getLikes({ target_type: targetType, target_id: targetId, user_id: currentUser.id })
      .then(r => btn.classList.toggle('liked', r.liked))
      .catch(() => {});
  }
  return btn;
}

// ==================== Comments Section ====================
function makeCommentsSection(targetType, targetId) {
  const wrap = document.createElement('div');
  wrap.className = 'comments-section';

  const list = document.createElement('div');
  list.className = 'comments-list';
  wrap.appendChild(list);

  // Input
  const inputWrap = document.createElement('div');
  inputWrap.className = 'comment-input-wrap';
  const input = document.createElement('input');
  input.placeholder = '写下评论...';
  const sendBtn = document.createElement('button');
  sendBtn.textContent = '发送';
  sendBtn.addEventListener('click', async () => {
    if (!currentUser) { toast('请先登录'); return; }
    const content = input.value.trim();
    if (!content) return;
    try {
      await API.postComment({ target_type: targetType, target_id: targetId, content });
      input.value = '';
      loadComments(targetType, targetId, list);
    } catch(e) { toast(e.message); }
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') sendBtn.click(); });
  inputWrap.appendChild(input);
  inputWrap.appendChild(sendBtn);
  wrap.appendChild(inputWrap);

  loadComments(targetType, targetId, list);
  return wrap;
}

async function loadComments(targetType, targetId, listEl) {
  try {
    const r = await API.getComments({ target_type: targetType, target_id: targetId });
    listEl.innerHTML = r.comments.map(c => `
      <div class="comment-item">
        <span class="comment-author">${esc(c.user_name)}</span>${esc(c.content)}
        <span class="comment-time">${fmtTime(c.created_at)}</span>
        ${(currentUser && (currentUser.is_admin || currentUser.id === c.user_id)) ?
          '<button class="message-delete" data-cid="'+c.id+'" style="float:right;background:none;border:none;cursor:pointer;color:#ccc;">🗑</button>' : ''}
      </div>
    `).join('');
    // Delete handlers
    listEl.querySelectorAll('.message-delete').forEach(b => {
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await API.deleteComment(b.dataset.cid);
          loadComments(targetType, targetId, listEl);
        } catch(err) { toast(err.message); }
      });
    });
  } catch(e) { listEl.innerHTML = ''; }
}

// ==================== FAB (Upload Button) ====================
function addFAB(onClick) {
  const fab = document.createElement('button');
  fab.id = 'fab';
  fab.className = 'fab';
  fab.textContent = '+';
  fab.title = '上传照片';
  fab.addEventListener('click', onClick);
  document.body.appendChild(fab);
}

function createUploadInput(acceptMultiple) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  if (acceptMultiple) input.multiple = true;
  input.style.display = 'none';
  document.body.appendChild(input);
  return input;
}

// ==================== PAGE: 主持记忆 ====================
async function renderMemories() {
  const el = document.getElementById('memoriesContent');
  el.innerHTML = '<p style="text-align:center;color:var(--text-light);padding:20px;">加载中...</p>';

  // Admin FAB
  if (currentUser && currentUser.is_admin) {
    addFAB(() => showMemoriesUpload());
  }

  try {
    const [photosRes, eventsRes] = await Promise.all([API.getPhotos('group'), API.getEvents()]);
    const photos = photosRes.photos;
    const events = eventsRes.events;

    let html = '';

    // Group Photos
    html += '<h3 style="margin:12px 0 8px;color:var(--brown);">📸 大合照</h3>';
    if (photos.length === 0) {
      html += '<p style="text-align:center;color:var(--text-light);padding:16px;">还没有大合照，管理员快来上传吧~</p>';
    } else {
      html += '<div class="photo-grid">';
      photos.forEach((p, i) => {
        html += '<div class="photo-card" data-idx="'+i+'">'
              + '<img src="/uploads/'+p.filename+'" alt="'+esc(p.title)+'" loading="lazy">'
              + '<div class="photo-info"><div class="photo-title">'+esc(p.title||'无标题')+'</div></div>'
              + '</div>';
      });
      html += '</div>';
      // Action bars
      photos.forEach((p, i) => {
        html += '<div class="action-bar" id="action-photo-'+p.id+'"></div>';
        html += '<div id="comments-photo-'+p.id+'"></div>';
      });
    }

    // Events
    html += '<h3 style="margin:16px 0 8px;color:var(--brown);">📅 活动记录</h3>';
    if (events.length === 0) {
      html += '<p style="text-align:center;color:var(--text-light);padding:16px;">暂无活动记录</p>';
    } else {
      html += '<div class="event-list">';
      events.forEach(ev => {
        html += '<div class="event-card" id="event-'+ev.id+'">'
              + '<span class="event-year">'+esc(ev.date.slice(0,4))+'</span>'
              + (ev.image ? '<img src="/uploads/'+ev.image+'" alt="'+esc(ev.title)+'" style="width:100%;max-height:300px;object-fit:cover;border-radius:8px;margin:8px 0;">' : '')
              + '<div class="event-title">'+esc(ev.title)+'</div>'
              + '<div class="event-meta">📅 '+esc(ev.date)+(ev.location?'  📍 '+esc(ev.location):'')+'</div>'
              + '<div class="event-desc">'+esc(ev.description||'')+'</div>'
              + '<div class="action-bar" id="action-event-'+ev.id+'"></div>'
              + '<div id="comments-event-'+ev.id+'"></div>'
              + '</div>';
      });
      html += '</div>';
    }

    // Admin buttons
    if (currentUser && currentUser.is_admin) {
      html += '<div class="admin-panel" style="margin-top:16px;">'
            + '<h3>🔧 管理操作</h3>'
            + '<button class="btn btn-outline btn-sm" id="btnAddEvent">+ 添加活动</button> '
            + '<button class="btn btn-outline btn-sm" id="btnImportRoster">📋 导入名单</button> '
            + '<button class="btn btn-outline btn-sm" id="btnViewInvites">🔑 查看邀请码</button>'
            + '</div>';
    }

    el.innerHTML = html;

    // Attach photo click → lightbox
    const photoCards = el.querySelectorAll('.photo-card');
    if (photoCards.length) {
      const srcPhotos = photos.map(p => ({ src: '/uploads/' + p.filename, title: p.title }));
      photoCards.forEach(card => {
        card.addEventListener('click', () => openLightbox(srcPhotos, parseInt(card.dataset.idx)));
      });
    }

    // Attach like & comment sections
    photos.forEach(p => {
      const actionEl = document.getElementById('action-photo-'+p.id);
      if (actionEl) {
        actionEl.appendChild(makeLikeBtn('photo', p.id, 0));
      }
      const commentsEl = document.getElementById('comments-photo-'+p.id);
      if (commentsEl) {
        commentsEl.appendChild(makeCommentsSection('photo', p.id));
      }
    });
    events.forEach(ev => {
      const actionEl = document.getElementById('action-event-'+ev.id);
      if (actionEl) {
        actionEl.appendChild(makeLikeBtn('event', ev.id, 0));
      }
      const commentsEl = document.getElementById('comments-event-'+ev.id);
      if (commentsEl) {
        commentsEl.appendChild(makeCommentsSection('event', ev.id));
      }
    });

    // Admin button handlers
    if (currentUser && currentUser.is_admin) {
      const btnAdd = document.getElementById('btnAddEvent');
      const btnImport = document.getElementById('btnImportRoster');
      const btnInvites = document.getElementById('btnViewInvites');
      if (btnAdd) btnAdd.addEventListener('click', showAddEvent);
      if (btnImport) btnImport.addEventListener('click', showImportRoster);
      if (btnInvites) btnInvites.addEventListener('click', showInviteCodes);
    }
  } catch(e) {
    el.innerHTML = '<p style="text-align:center;color:var(--red);padding:20px;">加载失败：'+esc(e.message)+'</p>';
  }
}

function showMemoriesUpload() {
  showModal(`
    <h2>📸 上传大合照</h2>
    <form id="memUploadForm">
      <div class="form-group"><label>选择照片</label><input type="file" name="photo" accept="image/*" required></div>
      <div class="form-group"><label>标题</label><input type="text" name="title" placeholder="照片标题"></div>
      <button type="submit" class="btn btn-primary" style="width:100%;">上传</button>
    </form>
  `);
  document.getElementById('memUploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await API.uploadPhoto(fd);
      toast('上传成功！');
      closeModal();
      renderMemories();
    } catch(err) { toast(err.message); }
  });
}

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
    try {
      const res = await fetch('/api/events', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error||'添加失败');
      toast('活动已添加！');
      closeModal();
      renderMemories();
    } catch(err) { toast(err.message); }
  });
}

function showImportRoster() {
  showModal(`
    <h2>📋 导入队员名单</h2>
    <p style="font-size:0.85rem;color:var(--text-light);margin-bottom:12px;">每行一个队员，格式：<b>姓名 班级</b>（空格分隔）</p>
    <form id="importForm">
      <div class="form-group"><textarea name="names" rows="6" placeholder="张三 计算机2201&#10;李四 软件2202&#10;王五 通信2203&#10;..."></textarea></div>
      <button type="submit" class="btn btn-primary" style="width:100%;">导入并生成邀请码</button>
    </form>
    <div id="importResults" style="margin-top:12px;"></div>
  `);
  document.getElementById('importForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const names = e.target.names.value;
    try {
      const r = await API.importRoster(names);
      const html = r.results.map(x =>
        '<div class="invite-item"><span>'+esc(x.name)+(x.className?' ('+esc(x.className)+')':'')+(x.skipped?' (已存在)':'')+'</span><span class="invite-code">'+x.inviteCode+'</span></div>'
      ).join('');
      document.getElementById('importResults').innerHTML = '<p style="color:green;margin-bottom:8px;">✅ 导入完成！以下是邀请码：</p>' + html;
      toast('导入成功！');
    } catch(err) { toast(err.message); }
  });
}

async function showInviteCodes() {
  try {
    const r = await API.getInvites();
    const html = r.users.map(u =>
      '<div class="invite-item"><span>'+esc(u.name)+(u.class_name?' ('+esc(u.class_name)+')':'')+(u.is_admin?' 👑':'')+'</span><span class="invite-code">'+(u.password_hash?'✅ 已注册':'🔑 '+u.invite_code)+'</span></div>'
    ).join('');
    showModal('<h2>🔑 邀请码列表</h2><div class="invite-list">'+html+'</div>');
  } catch(err) { toast(err.message); }
}

// ==================== PAGE: 队员风采 ====================
async function renderMembers() {
  const el = document.getElementById('membersContent');
  el.innerHTML = '<p style="text-align:center;color:var(--text-light);padding:20px;">加载中...</p>';

  try {
    const r = await API.getMembers();
    const members = r.members;
    let html = '<div class="member-grid">';
    members.forEach(m => {
      const avatarSrc = m.avatar ? '/uploads/'+m.avatar : 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect fill="#E8D5B7" width="60" height="60" rx="30"/><text x="30" y="38" text-anchor="middle" font-size="24">👤</text></svg>');
      html += '<div class="member-card" data-id="'+m.id+'">'
            + '<img class="member-avatar" src="'+avatarSrc+'" alt="'+esc(m.name)+'" loading="lazy">'
            + '<div class="member-name">'+esc(m.name)+'</div>'
            + (m.class_name ? '<div class="member-class" style="font-size:0.75rem;color:var(--gold);margin-bottom:2px;">📚 '+esc(m.class_name)+'</div>' : '')
            + '<div class="member-bio">'+esc(m.bio||'这个人很懒，还没写介绍...')+'</div>'
            + '</div>';
    });
    html += '</div>';
    el.innerHTML = html;

    // Click → member detail
    el.querySelectorAll('.member-card').forEach(card => {
      card.addEventListener('click', () => showMemberDetail(card.dataset.id));
    });
  } catch(e) {
    el.innerHTML = '<p style="text-align:center;color:var(--red);padding:20px;">加载失败：'+esc(e.message)+'</p>';
  }
}

async function showMemberDetail(memberId) {
  const overlay = document.getElementById('memberDetail');
  const content = document.getElementById('memberDetailContent');
  content.innerHTML = '<p style="text-align:center;padding:20px;">加载中...</p>';
  overlay.classList.add('show');

  try {
    const r = await API.getMember(memberId);
    const m = r.member;
    const photos = r.photos;
    const avatarSrc = m.avatar ? '/uploads/'+m.avatar : '';

    let html = '<div style="text-align:center;">';
    if (avatarSrc) html += '<img src="'+avatarSrc+'" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid var(--gold-light);margin-bottom:8px;">';
    html += '<h2 style="color:var(--brown);">'+esc(m.name)+'</h2>';
    if (m.class_name) html += '<p style="color:var(--gold);font-size:0.9rem;margin-bottom:4px;">📚 '+esc(m.class_name)+'</p>';
    html += '<p style="color:var(--text-light);margin-bottom:8px;">'+esc(m.bio||'暂无介绍')+'</p>';
    html += '<div class="action-bar" style="justify-content:center;" id="action-member-'+m.id+'"></div>';
    html += '<div id="comments-member-'+m.id+'"></div>';
    html += '</div>';

    // Photos
    if (photos.length > 0) {
      html += '<h4 style="margin:16px 0 8px;">📸 '+esc(m.name)+' 的照片</h4>';
      html += '<div class="photo-grid">';
      photos.forEach((p, i) => {
        html += '<div class="photo-card" data-idx="'+i+'">'
              + '<img src="/uploads/'+p.filename+'" alt="'+esc(p.title)+'" loading="lazy">'
              + '<div class="photo-info"><div class="photo-title">'+esc(p.title||'')+'</div></div>'
              + '</div>';
      });
      html += '</div>';
      photos.forEach(p => {
        html += '<div class="action-bar" id="action-photo-'+p.id+'"></div>';
        html += '<div id="comments-photo-'+p.id+'"></div>';
      });
    }

    content.innerHTML = html;

    // Attach photo lightbox
    const photoCards = content.querySelectorAll('.photo-card');
    if (photoCards.length) {
      const srcPhotos = photos.map(p => ({ src: '/uploads/'+p.filename, title: p.title }));
      photoCards.forEach(card => {
        card.addEventListener('click', () => openLightbox(srcPhotos, parseInt(card.dataset.idx)));
      });
    }

    // Like & comment for member
    const memberAction = document.getElementById('action-member-'+m.id);
    if (memberAction) memberAction.appendChild(makeLikeBtn('member', m.id, 0));
    const memberComments = document.getElementById('comments-member-'+m.id);
    if (memberComments) memberComments.appendChild(makeCommentsSection('member', m.id));

    // Like & comment for each photo
    photos.forEach(p => {
      const actionEl = document.getElementById('action-photo-'+p.id);
      if (actionEl) actionEl.appendChild(makeLikeBtn('photo', p.id, 0));
      const commentsEl = document.getElementById('comments-photo-'+p.id);
      if (commentsEl) commentsEl.appendChild(makeCommentsSection('photo', p.id));
    });
  } catch(e) {
    content.innerHTML = '<p style="text-align:center;color:var(--red);">加载失败：'+esc(e.message)+'</p>';
  }
}

document.getElementById('closeMemberDetail').addEventListener('click', () => {
  document.getElementById('memberDetail').classList.remove('show');
});

// ==================== PAGE: 我的 ====================
async function renderMy() {
  const el = document.getElementById('myContent');

  if (!currentUser) {
    el.innerHTML = `
      <div class="my-login-prompt">
        <p>登录后查看你的个人页面</p>
        <button class="btn btn-primary" id="btnShowLogin">登录</button>
        <button class="btn btn-outline" id="btnShowRegister" style="margin-left:8px;">注册</button>
      </div>
    `;
    document.getElementById('btnShowLogin').addEventListener('click', showLogin);
    document.getElementById('btnShowRegister').addEventListener('click', showRegister);
    return;
  }

  // Refresh user data
  try { const r = await API.me(); currentUser = r.user; } catch(e) {}

  const avatarSrc = currentUser.avatar ? '/uploads/'+currentUser.avatar : '';
  const isAdmin = currentUser.is_admin;

  let html = '<div class="my-profile">';
  html += avatarSrc
    ? '<img class="my-avatar" src="'+avatarSrc+'" alt="">'
    : '<div style="width:80px;height:80px;border-radius:50%;background:var(--gold-light);margin:0 auto 10px;display:flex;align-items:center;justify-content:center;font-size:2rem;">👤</div>';
  html += '<div class="my-name">'+esc(currentUser.name)+(isAdmin?' 👑':'')+'</div>';
  html += '<div class="my-role">'+(isAdmin?'管理员':'队员')+'</div>';
  html += '<div class="my-bio">'+esc(currentUser.bio||'点击下方编辑按钮写一段自我介绍吧~')+'</div>';
  html += '<button class="btn btn-outline btn-sm" id="btnEditBio">✏️ 编辑简介</button> ';
  html += '<button class="btn btn-outline btn-sm" id="btnUploadAvatar">📷 换头像</button> ';
  html += '<button class="btn btn-outline btn-sm" id="btnUploadPhoto">📸 上传照片</button> ';
  html += '<button class="btn btn-danger btn-sm" id="btnLogout" style="margin-top:8px;">退出登录</button>';
  html += '</div>';

  // My photos
  html += '<div class="my-photos"><h3 style="margin-bottom:8px;color:var(--brown);">我的照片</h3>';
  html += '<div id="myPhotosGrid"><p style="text-align:center;color:var(--text-light);">加载中...</p></div></div>';

  el.innerHTML = html;

  // Load my photos
  try {
    const pr = await API.getUserPhotos(currentUser.id);
    const photos = pr.photos;
    let photoHtml = '';
    if (photos.length === 0) {
      photoHtml = '<p style="text-align:center;color:var(--text-light);padding:16px;">还没有照片，点击上方按钮上传吧~</p>';
    } else {
      photoHtml = '<div class="photo-grid">';
      photos.forEach((p, i) => {
        photoHtml += '<div class="photo-card" data-idx="'+i+'">'
                   + '<img src="/uploads/'+p.filename+'" alt="'+esc(p.title)+'" loading="lazy">'
                   + '<div class="photo-info"><div class="photo-title">'+esc(p.title||'')+'</div></div>'
                   + '</div>';
      });
      photoHtml += '</div>';
      photos.forEach(p => {
        photoHtml += '<div class="action-bar" id="action-myphoto-'+p.id+'"></div>';
        photoHtml += '<div id="comments-myphoto-'+p.id+'"></div>';
      });
    }
    document.getElementById('myPhotosGrid').innerHTML = photoHtml;

    // Lightbox
    const cards = document.getElementById('myPhotosGrid').querySelectorAll('.photo-card');
    if (cards.length) {
      const srcPhotos = photos.map(p => ({ src: '/uploads/'+p.filename, title: p.title }));
      cards.forEach(card => {
        card.addEventListener('click', () => openLightbox(srcPhotos, parseInt(card.dataset.idx)));
      });
    }

    // Like & comment
    photos.forEach(p => {
      const actionEl = document.getElementById('action-myphoto-'+p.id);
      if (actionEl) actionEl.appendChild(makeLikeBtn('photo', p.id, 0));
      const commentsEl = document.getElementById('comments-myphoto-'+p.id);
      if (commentsEl) commentsEl.appendChild(makeCommentsSection('photo', p.id));
    });
  } catch(e) {
    document.getElementById('myPhotosGrid').innerHTML = '<p style="color:var(--red);text-align:center;">加载失败</p>';
  }

  // Button handlers
  document.getElementById('btnEditBio').addEventListener('click', showEditBio);
  document.getElementById('btnUploadAvatar').addEventListener('click', () => uploadAvatar());
  document.getElementById('btnUploadPhoto').addEventListener('click', () => uploadMyPhoto());
  document.getElementById('btnLogout').addEventListener('click', async () => {
    await API.logout();
    currentUser = null;
    toast('已退出');
    renderMy();
  });
}

function showEditBio() {
  showModal(`
    <h2>✏️ 编辑简介</h2>
    <form id="bioForm">
      <div class="form-group"><textarea name="bio" rows="3" placeholder="写一段自我介绍...">${esc(currentUser.bio||'')}</textarea></div>
      <button type="submit" class="btn btn-primary" style="width:100%;">保存</button>
    </form>
  `);
  document.getElementById('bioForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await API.updateMember(currentUser.id, e.target.bio.value);
      toast('简介已更新！');
      closeModal();
      renderMy();
    } catch(err) { toast(err.message); }
  });
}

function uploadAvatar() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', async () => {
    if (!input.files[0]) return;
    const fd = new FormData();
    fd.append('avatar', input.files[0]);
    try {
      await API.uploadAvatar(currentUser.id, fd);
      toast('头像已更新！');
      renderMy();
    } catch(err) { toast(err.message); }
    input.remove();
  });
  input.click();
}

function uploadMyPhoto() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.addEventListener('change', async () => {
    let count = 0;
    for (const file of input.files) {
      const fd = new FormData();
      fd.append('photo', file);
      fd.append('title', '');
      try {
        await API.uploadPhoto(fd);
        count++;
      } catch(e) { toast(e.message); }
    }
    if (count > 0) { toast('已上传 '+count+' 张照片！'); renderMy(); }
    input.remove();
  });
  input.click();
}

// ==================== Auth Modals ====================
function showLogin() {
  showModal(`
    <h2>🔑 登录</h2>
    <form id="loginForm">
      <div class="form-group"><label>姓名</label><input type="text" name="name" required></div>
      <div class="form-group"><label>密码</label><input type="password" name="password" required></div>
      <button type="submit" class="btn btn-primary" style="width:100%;">登录</button>
      <p style="text-align:center;margin-top:12px;font-size:0.85rem;">还没有账号？<a href="#" id="switchToRegister" style="color:var(--brown);">去注册</a></p>
    </form>
  `);
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await API.login({ name: e.target.name.value, password: e.target.password.value });
      currentUser = r.user;
      toast('登录成功！');
      closeModal();
      renderMy();
    } catch(err) { toast(err.message); }
  });
  document.getElementById('switchToRegister').addEventListener('click', (e) => { e.preventDefault(); showRegister(); });
}

function showRegister() {
  showModal(`
    <h2>📝 注册</h2>
    <form id="registerForm">
      <div class="form-group"><label>邀请码</label><input type="text" name="inviteCode" required placeholder="管理员给你的8位邀请码"></div>
      <div class="form-group"><label>姓名</label><input type="text" name="name" required placeholder="必须与名单中的姓名一致"></div>
      <div class="form-group"><label>设置密码</label><input type="password" name="password" required placeholder="至少4位"></div>
      <button type="submit" class="btn btn-primary" style="width:100%;">注册</button>
      <p style="text-align:center;margin-top:12px;font-size:0.85rem;">已有账号？<a href="#" id="switchToLogin" style="color:var(--brown);">去登录</a></p>
    </form>
  `);
  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await API.register({
        inviteCode: e.target.inviteCode.value,
        name: e.target.name.value,
        password: e.target.password.value
      });
      currentUser = r.user;
      toast('注册成功！欢迎加入！');
      closeModal();
      renderMy();
    } catch(err) { toast(err.message); }
  });
  document.getElementById('switchToLogin').addEventListener('click', (e) => { e.preventDefault(); showLogin(); });
}

// ==================== Utilities ====================
function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function fmtTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff/60000)+'分钟前';
  if (diff < 86400000) return Math.floor(diff/3600000)+'小时前';
  if (diff < 604800000) return Math.floor(diff/86400000)+'天前';
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
