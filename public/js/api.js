/* ============================================
   API 封装 — 与后端通信
   ============================================ */

const API = {
  async request(method, url, body, isFormData) {
    const opts = { method };
    if (body && !isFormData) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    } else if (body && isFormData) {
      opts.body = body;
    }
    const res = await fetch(url, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '请求失败');
    return data;
  },

  // Auth
  me:       ()              => API.request('GET', '/api/auth/me'),
  register: (b)             => API.request('POST', '/api/auth/register', b),
  login:    (b)             => API.request('POST', '/api/auth/login', b),
  logout:   ()              => API.request('POST', '/api/auth/logout'),

  // Photos
  getPhotos:     (cat)      => API.request('GET', '/api/photos' + (cat ? '?category=' + cat : '')),
  getUserPhotos: (uid)      => API.request('GET', '/api/photos/user/' + uid),
  uploadPhoto:   (fd)       => API.request('POST', '/api/photos', fd, true),
  deletePhoto:   (id)       => API.request('DELETE', '/api/photos/' + id),

  // Members
  getMembers:    ()         => API.request('GET', '/api/members'),
  getMember:     (id)       => API.request('GET', '/api/members/' + id),
  updateMember:  (id, bio)  => API.request('PUT', '/api/members/' + id, { bio }),
  uploadAvatar:  (id, fd)   => API.request('POST', '/api/members/' + id + '/avatar', fd, true),

  // Events
  getEvents:     ()         => API.request('GET', '/api/events'),
  createEvent:   (b)        => API.request('POST', '/api/events', b),
  deleteEvent:   (id)       => API.request('DELETE', '/api/events/' + id),

  // Likes
  toggleLike:    (b)        => API.request('POST', '/api/likes', b),
  getLikes:      (q)        => API.request('GET', '/api/likes?' + new URLSearchParams(q)),

  // Comments
  getComments:   (q)        => API.request('GET', '/api/comments?' + new URLSearchParams(q)),
  postComment:   (b)        => API.request('POST', '/api/comments', b),
  deleteComment: (id)       => API.request('DELETE', '/api/comments/' + id),

  // Admin
  importRoster:  (names)    => API.request('POST', '/api/admin/import', { names }),
  getInvites:    ()         => API.request('GET', '/api/admin/invites'),
  deleteUser:    (id)       => API.request('DELETE', '/api/admin/users/' + id),
};
