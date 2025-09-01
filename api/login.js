const { createClient } = require('@supabase/supabase-js');

// إعدادات الاتصال بـ Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://vmvjgwnnlpyucwsvpsso.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtdmpnd25ubHB5dWN3c3Zwc3NvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NjYzOTcsImV4cCI6MjA3MjI0MjM5N30.MVt07pKOkyx2nkBeLNhOPcGUcV-hZvwA_VD7YFEatYM';

// إنشاء عميل Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// تسجيل نشاط المستخدم
async function addActivity(activityType, username, details) {
  try {
    const { error } = await supabase
      .from('api_logs')
      .insert([
        {
          activity_type: activityType,
          username: username,
          details: details,
          created_at: new Date().toISOString()
        }
      ]);
    
    if (error) {
      console.error('خطأ في تسجيل النشاط:', error);
    }
  } catch (error) {
    console.error('استثناء في تسجيل النشاط:', error);
  }
}

// تسجيل معلومات الجهاز
async function logDeviceInfo(userId, req) {
  try {
    const ip = req.headers['x-forwarded-for'] || 'غير معروف';
    const deviceName = req.headers['user-agent'] || 'غير معروف';
    
    const { error: deviceError } = await supabase
      .from('user_devices')
      .upsert([
        {
          user_id: userId,
          device_name: deviceName,
          ip_address: ip,
          last_login: new Date().toISOString()
        }
      ]);
    
    if (deviceError) {
      console.error('خطأ في تسجيل معلومات الجهاز:', deviceError);
    }
  } catch (error) {
    console.error('خطأ في تسجيل معلومات الجهاز:', error);
  }
}

module.exports = async (req, res) => {
  // إعداد CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // التعامل مع طلبات OPTIONS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // التأكد من أن الطلب هو POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'طريقة غير مسموح بها' });
  }

  try {
    console.log('محاولة تسجيل دخول جديدة');
    const { username, password, isAdmin } = req.body;
    
    if (!username || !password) {
      console.log('خطأ: بيانات تسجيل الدخول غير مكتملة');
      return res.status(400).json({ success: false, message: 'يجب توفير اسم المستخدم وكلمة المرور' });
    }
    
    // البحث عن المستخدم
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('*');
    
    if (userError) {
      console.error('خطأ في البحث عن المستخدم:', userError);
      return res.status(500).json({ 
        success: false, 
        message: 'حدث خطأ أثناء البحث عن المستخدم'
      });
    }
    
    // البحث عن المستخدم في البيانات المسترجعة
    const account = users.find(user => 
      user.username === username || 
      user.user_name === username || 
      user.name === username || 
      user.email === username
    );
    
    if (!account) {
      return res.status(401).json({ 
        success: false, 
        message: 'اسم المستخدم غير موجود. يرجى التواصل مع المدير.' 
      });
    }
    
    // التحقق من كلمة المرور
    const isPasswordValid = account.password === password || account.password_hash === password;
    
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'كلمة المرور غير صحيحة' 
      });
    }
    
    // التحقق من صلاحيات المدير
    if (isAdmin && account.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'ليس لديك صلاحيات المدير' 
      });
    }
    
    // تسجيل نشاط تسجيل الدخول ومعلومات الجهاز
    await Promise.all([
      addActivity('login', username, { success: true, isAdmin }),
      logDeviceInfo(account.id, req)
    ]);
    
    // إعداد بيانات الاستجابة
    return res.status(200).json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      user: {
        id: account.id,
        username: account.username || account.user_name || account.name,
        role: account.role || 'user',
        email: account.email
      }
    });
    
  } catch (error) {
    console.error('خطأ في معالجة طلب تسجيل الدخول:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'حدث خطأ أثناء معالجة الطلب'
    });
  }
};