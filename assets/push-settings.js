/* Notification settings presentation only; lifecycle authority stays in pushLifecycle. */
(function (root) {
  'use strict';
  const views = {
    SETUP_REQUIRED:['Thông báo chưa được bật trên thiết bị này.','enable'],
    UNBOUND:['Thông báo chưa được bật trên thiết bị này.','enable'],
    DISABLED:['Thông báo đã tắt trên thiết bị này.','enable'],
    ACTIVE:['Thông báo đang bật trên thiết bị này.','disable'],
    REPAIR_REQUIRED:['Cần sửa kết nối thông báo trên thiết bị này.','repair'],
    LOCAL_METADATA_INVALID:['Cần sửa kết nối thông báo trên thiết bị này.','repair'],
    INVALID_CAPABILITY:['Cần sửa kết nối thông báo trên thiết bị này.','repair'],
    PERMISSION_DENIED:['Thiết bị đang chặn thông báo. Hãy kiểm tra quyền thông báo trong cài đặt trình duyệt hoặc thiết bị, rồi kiểm tra lại.'],
    HOME_SCREEN_REQUIRED:['Trên iPhone/iPad, hãy thêm Nhà có Alex vào Màn hình chính qua menu Chia sẻ của Safari, rồi mở ứng dụng từ Màn hình chính để bật thông báo.'],
    UNSUPPORTED:['Trình duyệt này chưa hỗ trợ thông báo cho Nhà có Alex. Hãy dùng trình duyệt tương thích hoặc ứng dụng trên Màn hình chính.'],
    UNSUPPORTED_COORDINATION:['Trình duyệt chưa hỗ trợ phối hợp thông báo an toàn giữa các cửa sổ. Chức năng thông báo hiện không khả dụng.'],
    OLD_ACCOUNT_PUSH_RISK:['Chưa xác nhận được việc ngừng thông báo của tài khoản trước. Hãy sửa kết nối; nếu chưa sửa được, tắt thông báo của Nhà có Alex trong cài đặt trình duyệt hoặc thiết bị.','repair',true],
    OUTCOME_UNKNOWN:['Chưa xác định được kết quả thao tác. Không bật hoặc tắt lại lúc này. Hãy kiểm tra trạng thái; nếu còn lo ngại, tắt thông báo của Nhà có Alex trong cài đặt trình duyệt hoặc thiết bị.',null,true],
    SIGN_IN_REQUIRED:['Vui lòng đăng nhập để cài đặt thông báo.'],
    DISABLED_LOCAL_UNSUBSCRIBE_FAILED:['Thông báo đã tắt trên máy chủ, nhưng chưa gỡ được đăng ký trên thiết bị. Kiểm tra cài đặt thông báo của trình duyệt hoặc thiết bị trước khi bật lại.',null,true],
    RECONCILIATION_REQUIRED:['Cần kiểm tra lại trạng thái cho tài khoản hiện tại trước khi thao tác.'],
    CHECKING:['Đang kiểm tra trạng thái thông báo…'],
    UNAVAILABLE:['Chưa kiểm tra được trạng thái thông báo. Bạn có thể kiểm tra lại.'],
    NOT_INITIALIZED:['Hãy kiểm tra trạng thái thông báo trước khi thao tác.'],
    USER_GESTURE_REQUIRED:['Hãy nhấn lại nút thông báo để thao tác trực tiếp.'],
    STATE_CONFLICT:['Trạng thái đã thay đổi ở cửa sổ khác. Hãy kiểm tra lại trước khi chọn thao tác.'],
    ACCOUNT_BINDING_CONFLICT:['Cần kiểm tra và sửa kết nối cho tài khoản hiện tại.','repair'],
    ENDPOINT_CONFLICT:['Đăng ký thông báo chưa thể dùng lại. Không tự động thử lại; hãy kiểm tra cài đặt thông báo của thiết bị.',null,true]
  };
  const labels={enable:'Bật thông báo',repair:'Sửa thông báo',disable:'Tắt thông báo'};
  function view(value) {
    const name=typeof value?.status==='string'&&Object.hasOwn(views,value.status)?value.status:'UNAVAILABLE';
    const code=value?.risk===true&&name!=='OUTCOME_UNKNOWN'?'OLD_ACCOUNT_PUSH_RISK':name;
    const [message,action,warning]=views[code];
    return {message,action:action||null,warning:warning===true};
  }
  function create({lifecycle,getAccount,document:doc=root.document}={}) {
    const dialog=doc.getElementById('pushSettingsDialog');
    const message=doc.getElementById('pushSettingsMessage'),warning=doc.getElementById('pushSettingsWarning');
    const primary=doc.getElementById('pushSettingsAction'),refresh=doc.getElementById('pushSettingsRefresh');
    const categories=doc.getElementById('pushCategorySettings');
    function resetCategories(account) {
      // Transport/revision contract is unavailable. Unknown is NOT false/default.
      // No preference reader, setter, draft save or lifecycle call is fabricated.
      categories.hidden=!account;
      categories.dataset.state='unknown';
      for(const input of categories.querySelectorAll('[data-push-category]')){
        input.checked=false;input.indeterminate=true;input.disabled=true;
      }
      doc.getElementById('pushCategorySave').disabled=true;
    }
    resetCategories(null);
    let owner=null,revision=0,pending=null,override=null,opener=null,observation=null;
    const isOpen=()=>dialog.open;
    const read=()=>{try{return lifecycle?.getState()||{status:'UNSUPPORTED'}}catch{return {status:'UNAVAILABLE'}}};
    function visibleState() {
      const state=read();
      if(override?.status==='OUTCOME_UNKNOWN')return override;
      if(state.status==='OUTCOME_UNKNOWN'||state.status==='OLD_ACCOUNT_PUSH_RISK'||state.risk===true)return state;
      return override||state;
    }
    function stopObservation(){if(observation!==null){root.clearTimeout(observation);observation=null;}}
    function observePending() {
      if(observation!==null||!isOpen()||!pending)return;
      observation=root.setTimeout(()=>{
        observation=null;
        if(isOpen()&&pending){render();observePending();}
      },250); // Public state only; no initialization or mutation polling.
    }
    function render() {
      if(!isOpen())return;
      if(owner!==getAccount()){close();return;}
      const model=view(!owner?{status:'SIGN_IN_REQUIRED'}:visibleState());
      message.textContent=model.warning?'Thông báo cần được kiểm tra trước khi tiếp tục.':model.message;
      warning.textContent=model.warning?model.message:'';
      warning.hidden=!model.warning;
      primary.hidden=!model.action;
      primary.textContent=model.action?labels[model.action]:'';
      primary.disabled=!!pending||!owner;
      refresh.disabled=!!pending||!owner||!lifecycle;
      dialog.dataset.pending=String(!!pending);
      // Keep the separate risk alert outside any busy live-region subtree.
      message.setAttribute('aria-busy',String(!!pending));
    }
    function finish(jobOwner,jobRevision,error,mutation) {
      stopObservation();
      pending=null;
      if(!isOpen())return;
      if(owner!==getAccount()){close();return;}
      if(jobOwner!==owner||jobRevision!==revision)override={status:'RECONCILIATION_REQUIRED'};
      else override=error?{status:mutation?'OUTCOME_UNKNOWN':'UNAVAILABLE'}:null;
      render();
    }
    function run(action) {
      if(!['initialize','enable','repair','disable'].includes(action))return;
      if(pending||!isOpen())return;
      if(!owner||owner!==getAccount()){render();return;}
      if(!lifecycle){override={status:'UNSUPPORTED'};render();return;}
      if(action!=='initialize'&&action!==view(visibleState()).action){render();return;}
      const jobOwner=owner,jobRevision=revision,mutation=action!=='initialize';
      pending=true;render();
      let work;
      try {
        // NO await, timer, initialization or promise hop before these calls:
        // iOS permission must remain within the original trusted click stack.
        if(action==='enable')work=lifecycle.enable();
        else if(action==='repair')work=lifecycle.repair();
        else if(action==='disable')work=lifecycle.disable({disable:true});
        else work=lifecycle.initialize();
      } catch {finish(jobOwner,jobRevision,true,mutation);return;}
      pending=Promise.resolve(work).then(()=>finish(jobOwner,jobRevision,false,mutation),()=>finish(jobOwner,jobRevision,true,mutation));
      observePending();
    }
    function close() {
      stopObservation();
      resetCategories(null);
      ++revision;owner=null;override=null;
      if(dialog.open)dialog.close();
    }
    function open(trigger) {
      opener=trigger||doc.activeElement;
      owner=getAccount();++revision;override=pending?{status:'CHECKING'}:null;
      resetCategories(owner);
      if(!dialog.open){try{dialog.showModal()}catch{return;}}
      render();
      if(owner&&!pending)run('initialize');
      else observePending();
    }
    primary.addEventListener('click',()=>run(view(visibleState()).action));
    refresh.addEventListener('click',()=>run('initialize'));
    doc.getElementById('pushSettingsClose').addEventListener('click',close);
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('close',()=>{
      if(dialog.open)return; // Ignore an older queued close event after reopening.
      stopObservation();
      resetCategories(null);
      ++revision;owner=null;override=null;
      const target=getAccount()?doc.querySelector('.account-trigger'):doc.getElementById('loginBtn');
      if(target?.isConnected)target.focus();else if(opener?.isConnected)opener.focus();
    });
    return Object.freeze({open,accountChanged(){if(isOpen()&&owner!==getAccount())close();}});
  }
  if(typeof module==='object'&&module.exports)module.exports={create,view};
  else root.NcaPushSettings=Object.freeze({create});
})(typeof window==='object'?window:globalThis);
