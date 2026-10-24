/* Device lifecycle controls and separate authenticated account preferences. */
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
  const categoryKeys=['comment','reply','mention','comment_like','new_story','new_chapter'];
  const maxRevision=9223372036854775807n;
  function validTimestamp(value) {
    if(value===null)return true;
    if(typeof value!=='string')return false;
    const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
    if(!m)return false;
    const [,y,mo,d,h,mi,se,,zh='0',zm='0']=m;
    const year=Number(y),month=Number(mo),day=Number(d);
    const days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
    return year>0&&month>=1&&month<=12&&day>=1&&day<=days[month-1]&&Number(h)<24&&Number(mi)<60&&Number(se)<60&&Number(zh)<=15&&Number(zm)<60&&Number.isFinite(Date.parse(value));
  }
  function parsePreferences(value) {
    const fields=['revision',...categoryKeys.flatMap(k=>[k+'_enabled',k+'_enabled_since'])];
    if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==fields.length||fields.some(k=>!Object.hasOwn(value,k))||
      typeof value.revision!=='string'||value.revision.length>19||!/^(0|[1-9][0-9]*)$/.test(value.revision)||BigInt(value.revision)>maxRevision)throw Error('INVALID_PREFERENCES');
    for(const key of categoryKeys)if(typeof value[key+'_enabled']!=='boolean'||!validTimestamp(value[key+'_enabled_since']))throw Error('INVALID_PREFERENCES');
    return Object.freeze(Object.fromEntries(fields.map(k=>[k,value[k]])));
  }
  function create({lifecycle,sb,getAccount,document:doc=root.document}={}) {
    const dialog=doc.getElementById('pushSettingsDialog');
    const message=doc.getElementById('pushSettingsMessage'),warning=doc.getElementById('pushSettingsWarning');
    const primary=doc.getElementById('pushSettingsAction'),refresh=doc.getElementById('pushSettingsRefresh');
    const categories=doc.getElementById('pushCategorySettings'),categoryStatus=doc.getElementById('pushCategoryStatus');
    const categorySave=doc.getElementById('pushCategorySave'),categoryFields=categories.querySelector('fieldset');
    const categoryInputs=[...categories.querySelectorAll('[data-push-category]')];
    let owner=null,revision=0,pending=null,override=null,opener=null,observation=null;
    let categoryEpoch=0,categorySnapshot=null,categoryBusy=false,categoryWrite=null;
    function projectCategories(snapshot) {
      for(const input of categoryInputs){
        input.checked=snapshot?snapshot[input.dataset.pushCategory+'_enabled']:false;
        input.indeterminate=!snapshot;
      }
    }
    function resetCategories(account) {
      ++categoryEpoch;categorySnapshot=null;categoryBusy=false;
      categories.hidden=!account;categories.dataset.state='unknown';
      projectCategories(null);categoryFields.disabled=true;
      for(const input of categoryInputs)input.disabled=true;
      categorySave.disabled=true;
      categoryStatus.textContent=account?'Đang tải lựa chọn thông báo…':'Vui lòng đăng nhập để chọn loại thông báo.';
    }
    function categoryLive(job) {
      return isOpen()&&!!job.account&&owner===job.account&&getAccount()===job.account&&categoryEpoch===job.epoch;
    }
    function renderCategories() {
      const locked=!owner||owner!==getAccount()||!categorySnapshot||categoryBusy||!!categoryWrite;
      categoryFields.disabled=locked;
      for(const input of categoryInputs)input.disabled=locked;
      categorySave.disabled=locked||!categoryInputs.some(input=>input.checked!==categorySnapshot[input.dataset.pushCategory+'_enabled']);
      categories.setAttribute('aria-busy',String(categoryBusy||!!categoryWrite));
    }
    async function preferenceRpc(job,name,args) {
      if(!categoryLive(job)||!sb?.auth?.getSession||!sb.rpc)throw Error('PREFERENCES_UNAVAILABLE');
      const session=await sb.auth.getSession();
      if(!categoryLive(job)||session?.error||session?.data?.session?.user?.id!==job.account||typeof session.data.session.access_token!=='string'||!session.data.session.access_token)throw Error('PREFERENCES_UNAVAILABLE');
      // Pin the captured existing session: an SDK auth change during its async
      // fetch must never send this account's draft under another account's token.
      const request=args?sb.rpc(name,args):sb.rpc(name);
      if(typeof request?.setHeader!=='function')throw Error('PREFERENCES_UNAVAILABLE');
      return await request.setHeader('Authorization','Bearer '+session.data.session.access_token);
    }
    async function loadCategories(afterMessage,afterState='ready') {
      if(!isOpen()||!owner||owner!==getAccount())return;
      const job={account:owner,epoch:++categoryEpoch};
      categorySnapshot=null;categoryBusy=true;projectCategories(null);
      categories.dataset.state='loading';categoryStatus.textContent='Đang tải lựa chọn thông báo…';renderCategories();
      try {
        const result=await preferenceRpc(job,'nca_get_push_preferences');
        if(!categoryLive(job))return;
        if(result?.error)throw Error('PREFERENCES_UNAVAILABLE');
        categorySnapshot=parsePreferences(result?.data);projectCategories(categorySnapshot);
        categories.dataset.state=afterState;
        categoryStatus.textContent=categoryWrite?'Đang chờ kết quả lần lưu trước. Không tự động thử lại.':afterMessage||'Chọn loại thông báo rồi nhấn Lưu lựa chọn.';
      } catch {
        if(!categoryLive(job))return;
        categorySnapshot=null;projectCategories(null);categories.dataset.state='error';
        categoryStatus.textContent=afterMessage?'Chưa xác nhận kết quả lưu và chưa tải được lựa chọn hiện tại. Hãy đóng rồi mở lại cài đặt; không tự động thử lưu lại.':'Chưa tải được lựa chọn. Hãy đóng rồi mở lại cài đặt để kiểm tra.';
      } finally {
        if(categoryLive(job)){categoryBusy=false;renderCategories();}
      }
    }
    async function saveCategories() {
      if(!isOpen()||!owner||owner!==getAccount()||categoryBusy||categoryWrite||!categorySnapshot||categorySave.disabled)return;
      const job={account:owner,epoch:categoryEpoch};
      const args={p_expected_revision:categorySnapshot.revision};
      for(const input of categoryInputs)args['p_'+input.dataset.pushCategory+'_enabled']=input.checked;
      categoryWrite=job;categoryBusy=true;categories.dataset.state='saving';
      categoryStatus.textContent='Đang lưu lựa chọn…';renderCategories();
      let reconciled=false,conflict=false;
      try {
        const result=await preferenceRpc(job,'nca_set_push_preferences',args);
        if(!categoryLive(job))return;
        conflict=result?.error?.code==='PT409';
        if(result?.error)throw Error('PREFERENCES_UNCONFIRMED');
        const snapshot=parsePreferences(result?.data);
        if(BigInt(snapshot.revision)!==BigInt(args.p_expected_revision)+1n||categoryKeys.some(k=>snapshot[k+'_enabled']!==args['p_'+k+'_enabled']))throw Error('PREFERENCES_UNCONFIRMED');
        categorySnapshot=snapshot;projectCategories(snapshot);categories.dataset.state='success';
        categoryStatus.textContent='Đã lưu lựa chọn thông báo.';
      } catch {
        if(categoryLive(job)){
          categoryWrite=null;reconciled=true;
          await loadCategories(conflict?'Lựa chọn đã thay đổi ở nơi khác. Hãy xem lại và lưu lại nếu cần.':'Chưa xác nhận đã lưu. Đã tải lựa chọn hiện tại; hãy xem lại trước khi lưu lần nữa.',conflict?'conflict':'unknown');
        }
      } finally {
        if(categoryWrite===job)categoryWrite=null;
        if(categoryLive(job)){categoryBusy=false;renderCategories();}
        else if(isOpen()&&owner&&owner===getAccount()){
          // Never apply an old response after close/reopen or an account switch.
          // A reopened same account gets one fresh read after the old write ends.
          if(!reconciled&&owner===job.account)void loadCategories('Đã tải lựa chọn hiện tại. Hãy xem lại trước khi lưu.');
          else renderCategories();
        }
      }
    }
    resetCategories(null);
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
      if(!dialog.open){
        const closeControl=doc.getElementById('pushSettingsClose'),wasDisabled=closeControl.disabled;
        closeControl.disabled=true; // Exclude × from the browser's native initial focus selection.
        try{dialog.showModal();dialog.focus({preventScroll:true});}catch{return;}
        finally{closeControl.disabled=wasDisabled;}
      }
      render();
      if(owner)void loadCategories();
      if(owner&&!pending)run('initialize');
      else observePending();
    }
    categorySave.addEventListener('click',()=>{void saveCategories();});
    for(const input of categoryInputs)input.addEventListener('change',renderCategories);
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
  if(typeof module==='object'&&module.exports)module.exports={create,view,parsePreferences};
  else root.NcaPushSettings=Object.freeze({create});
})(typeof window==='object'?window:globalThis);
