const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const app = express();

// إعدادات الاتصال بـ Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://vmvjgwnnlpyucwsvpsso.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtdmpnd25ubHB5dWN3c3Zwc3NvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NjYzOTcsImV4cCI6MjA3MjI0MjM5N30.MVt07pKOkyx2nkBeLNhOPcGUcV-hZvwA_VD7YFEatYM';

// إنشاء عميل Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('تم إنشاء اتصال Supabase');

// التأكد من وجود مستخدم المدير
async function ensureAdminUser() {
  try {
    // التحقق من وجود مستخدم المدير في جدول users
    const { data: adminUser, error } = await supabase
      .from('users')
      .select('*')
      .eq('user_name', 'admin')
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('خطأ في البحث عن المدير:', error);
      return;
    }
    
    // إذا لم يكن موجودًا، قم بإنشائه
    if (!adminUser) {
      // إنشاء حساب المدير
      const { data: newAdmin, error: createError } = await supabase
        .from('users')
        .insert([
          {
            user_name: 'admin',
            password: 'admin123',
            role: 'admin',
            created_at: new Date().toISOString()
          }
        ])
        .select();
      
      if (createError) {
        console.error('خطأ في إنشاء حساب المدير:', createError);
        return;
      }
      
      // إضافة صلاحيات المدير
      if (newAdmin && newAdmin.length > 0) {
        const adminId = newAdmin[0].id;
        const { error: permissionError } = await supabase
          .from('permissions')
          .insert([
            {
              user_id: adminId,
              permission: 'all'
            }
          ]);
        
        if (permissionError) {
          console.error('خطأ في إضافة صلاحيات المدير:', permissionError);
          return;
        }
      }
      
      console.log('تم إنشاء مستخدم المدير بنجاح');
    } else {
      console.log('مستخدم المدير موجود بالفعل');
    }
  } catch (error) {
    console.error('خطأ في التحقق من مستخدم المدير:', error);
  }
}

// تعطيل دالة التأكد من وجود مستخدم المدير مؤقتاً لتجنب الخطأ
// ensureAdminUser();

// تقديم الملفات الثابتة من مجلد public
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// إعداد CORS
const cors = require('cors');
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// إضافة middleware للتعامل مع الأخطاء
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// توجيه الصفحة الرئيسية إلى صفحة تسجيل الدخول
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// دالة لتنسيق التاريخ والوقت بالتاريخ الميلادي وتنسيق 12 ساعة
function formatDateTime(date) {
  if (!date) return '';
  
  const d = new Date(date);
  
  try {
    // تنسيق التاريخ الميلادي
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    
    // تنسيق الوقت بنظام 12 ساعة
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const seconds = d.getSeconds().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'م' : 'ص';
    
    hours = hours % 12;
    hours = hours ? hours : 12; // الساعة 0 تصبح 12
    const formattedHours = hours.toString().padStart(2, '0');
    
    return `${day}/${month}/${year} ${formattedHours}:${minutes}:${seconds} ${ampm}`;
  } catch (error) {
    console.error('خطأ في تنسيق التاريخ:', error);
    return d.toISOString();
  }
}

// إضافة نشاط جديد
async function addActivity(type, username, details, response = null) {
  try {
    const now = new Date();
    // إضافة نشاط جديد إلى جدول api_logs
    const { data: activity, error } = await supabase
      .from('api_logs')
      .insert([
        {
          query_type: type,
          query_value: username,
          response: response ? JSON.stringify(response) : JSON.stringify({ details }),
          created_at: now.toISOString(),
          formatted_date: formatDateTime(now)
        }
      ])
      .select();
    
    if (error) {
      console.error('خطأ في إضافة النشاط:', error);
      return null;
    }
    
    // حذف الأنشطة القديمة للاحتفاظ بآخر 1000 نشاط فقط
    const { count, error: countError } = await supabase
      .from('api_logs')
      .select('*', { count: 'exact', head: true });
    
    if (!countError && count > 1000) {
      // الحصول على الأنشطة القديمة
      const { data: oldestActivities, error: oldestError } = await supabase
        .from('api_logs')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(count - 1000);
      
      if (!oldestError && oldestActivities.length > 0) {
        // حذف الأنشطة القديمة
        const { error: deleteError } = await supabase
          .from('api_logs')
          .delete()
          .in('id', oldestActivities.map(a => a.id));
        
        if (deleteError) {
          console.error('خطأ في حذف الأنشطة القديمة:', deleteError);
        }
      }
    }
    
    return activity ? activity[0] : null;
  } catch (error) {
    console.error('خطأ في إضافة النشاط:', error);
    return null;
  }
}

// معالج API للوكيل
app.get('/api/proxy', async (req, res) => {
  const { unique } = req.query;

  if (!unique) {
    return res.status(400).json({ error: "يرجى إدخال الرقم الموحد." });
  }

  try {
    const response = await fetch(`http://176.241.95.201:8092/id?unique=${encodeURIComponent(unique)}`, {
      method: 'GET',
      headers: {
        Authorization: 'Basic YWRtaW46MjQxMDY3ODkw',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `السيرفر رد بحالة ${response.status}` });
    }

    const data = await response.json();

    // التأكد من وجود البيانات المطلوبة
    if (data.trips && Array.isArray(data.trips)) {
      data.trips.forEach(trip => {
        // التأكد من وجود البيانات الأساسية
        if (!trip.driver_name) trip.driver_name = 'غير متوفر';
        if (!trip.truck_number) trip.truck_number = 'غير متوفر';
        if (!trip.container_number_export) trip.container_number_export = 'غير متوفر';
        if (!trip.manifest) trip.manifest = 'غير متوفر';
        if (!trip.sonar_date) trip.sonar_date = 'غير متوفر';
        if (!trip.sonar_image_url) trip.sonar_image_url = 'غير متوفر';
        
        // التأكد من وجود بيانات السونار
        if (trip.sonarData && trip.sonarData.manifests && trip.sonarData.manifests.length > 0) {
          const manifest = trip.sonarData.manifests[0];
          if (manifest.manifest_number) trip.manifest = manifest.manifest_number;
          if (manifest.sonar_date) trip.sonar_date = manifest.sonar_date;
          if (manifest.sonar_image_url) trip.sonar_image_url = manifest.sonar_image_url;
        } else {
          // إذا لم تكن بيانات السونار متوفرة، تأكد من تعيين القيم الافتراضية
          trip.sonar_date = 'غير متوفر';
          trip.sonar_image_url = 'غير متوفر';
        }
      });
    }

    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: "خطأ في الاتصال بالسيرفر الخارجي", details: err.message });
  }
});

// API لتسجيل الدخول
app.post('/api/login', async (req, res) => {
  const { username, password, isAdmin } = req.body;
  
  if (!username || !password) {
    return res.status(200).json({ success: false, message: 'يجب توفير اسم المستخدم وكلمة المرور' });
  }
  
  try {
    let account, error;
    
    // البحث عن المستخدم في جدول users بغض النظر عن نوع المستخدم
    // نستخدم اسم المستخدم للبحث
    const { data, error: userError } = await supabase
      .from('users')
      .select('*');
    
    if (userError) {
      console.error('خطأ في البحث عن المستخدم:', userError);
      return res.status(200).json({ success: false, message: 'حدث خطأ أثناء البحث عن المستخدم' });
    }
    
    // البحث عن المستخدم في البيانات المسترجعة
    account = data.find(user => 
      user.username === username || 
      user.user_name === username || 
      user.name === username || 
      user.email === username
    );
    
    if (!account) {
      return res.status(200).json({ success: false, message: 'اسم المستخدم غير موجود. يرجى التواصل مع المدير.' });
    }
    
    // التحقق من كلمة المرور
    if (account.password !== password && account.password_hash !== password) {
      return res.status(200).json({ success: false, message: 'كلمة المرور غير صحيحة' });
    }
    
    // التحقق من صلاحية المدير إذا كان تسجيل دخول مدير
    if (isAdmin && account.role !== 'admin') {
      return res.status(200).json({ success: false, message: 'ليس لديك صلاحيات المدير' });
    }
    
    console.log('تم تسجيل الدخول بنجاح:', username, isAdmin ? '(مدير)' : '(مستخدم عادي)');
    
    // تسجيل معلومات الجهاز
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const deviceName = req.headers['user-agent'] || 'غير معروف';
    
    // إضافة أو تحديث معلومات الجهاز
    const { error: deviceError } = await supabase
      .from('user_devices')
      .upsert([
        {
          user_id: account.id,
          device_name: deviceName,
          ip_address: ip,
          last_login: new Date().toISOString()
        }
      ]);
    
    if (deviceError) {
      console.error('خطأ في تسجيل معلومات الجهاز:', deviceError);
    }
    
    // تسجيل نشاط تسجيل الدخول
    await addActivity('login', username, account.role === 'admin' ? 'تسجيل دخول مدير' : 'تسجيل دخول مستخدم');
    
    // إعداد معلومات المستخدم للإرجاع
    const userInfo = {
      id: account.id,
      username: account.username || account.user_name || account.name || account.email,
      role: account.role,
      permissions: account.permissions || {}
    };
    
    return res.json({ 
      success: true, 
      username: account.username || account.user_name || account.name || account.email, 
      userId: account.id,
      role: account.role,
      isAdmin: account.role === 'admin',
      permissions: account.permissions,
      user: userInfo
    });
  } catch (error) {
    console.error('خطأ في تسجيل الدخول:', error);
    return res.status(200).json({ success: false, message: 'حدث خطأ أثناء تسجيل الدخول' });
  }
});

// API لجلب الإحصائيات
app.get('/api/stats', async (req, res) => {
  try {
    // حساب إجمالي المستخدمين
    const { count: totalUsers, error: usersError } = await supabase
      .from('accounts')
      .select('*', { count: 'exact', head: true });
    
    if (usersError) {
      console.error('خطأ في حساب إجمالي المستخدمين:', usersError);
      return res.status(500).json({ error: 'خطأ في جلب الإحصائيات' });
    }
    
    // حساب المستخدمين النشطين (آخر 7 أيام)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { count: activeUsers, error: activeError } = await supabase
      .from('user_devices')
      .select('*', { count: 'exact', head: true })
      .gt('last_login', sevenDaysAgo.toISOString());
    
    if (activeError) {
      console.error('خطأ في حساب المستخدمين النشطين:', activeError);
      return res.status(500).json({ error: 'خطأ في جلب الإحصائيات' });
    }
    
    // حساب إجمالي الأنشطة
    const { count: totalActivities, error: activitiesError } = await supabase
      .from('api_logs')
      .select('*', { count: 'exact', head: true });
    
    if (activitiesError) {
      console.error('خطأ في حساب إجمالي الأنشطة:', activitiesError);
      return res.status(500).json({ error: 'خطأ في جلب الإحصائيات' });
    }
    
    // حساب عمليات البحث
    const { count: searchCount, error: searchError } = await supabase
      .from('api_logs')
      .select('*', { count: 'exact', head: true })
      .eq('query_type', 'search');
    
    // إحصائيات البحث اليومية (آخر 7 أيام)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dailyStats = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      
      const { count, error: countError } = await supabase
        .from('api_logs')
        .select('*', { count: 'exact', head: true })
        .eq('query_type', 'search')
        .gte('created_at', date.toISOString())
        .lt('created_at', nextDay.toISOString());
      
      if (countError) {
        console.error('خطأ في حساب إحصائيات البحث اليومية:', countError);
      }
      
      dailyStats.push({
        date: date.toISOString().split('T')[0],
        count: count || 0
      });
    }
    
    res.json({
      success: true,
      totalUsers: totalUsers || 0,
      activeUsers: activeUsers || 0,
      totalActivities: totalActivities || 0,
      searchCount: searchCount || 0,
      dailyStats
    });
  } catch (error) {
    console.error('خطأ في جلب الإحصائيات:', error);
    res.status(200).json({ 
      success: false, 
      error: 'حدث خطأ أثناء جلب الإحصائيات',
      totalUsers: 0,
      activeUsers: 0,
      totalActivities: 0,
      searchCount: 0,
      dailyStats: []
    });
  }
});

// API لتسجيل عمليات البحث
app.post('/api/log-search', async (req, res) => {
  const { username, searchTerm } = req.body;
  
  if (!username || !searchTerm) {
    return res.status(400).json({ success: false, message: 'يجب توفير اسم المستخدم ومصطلح البحث' });
  }
  
  try {
    await addActivity('search', username, `بحث عن: ${searchTerm}`);
    return res.status(200).json({ success: true, message: 'تم تسجيل عملية البحث بنجاح' });
  } catch (error) {
    console.error('خطأ في تسجيل عملية البحث:', error);
    return res.status(500).json({ success: false, message: 'فشل في تسجيل عملية البحث' });
  }
});

// API لجلب النشاطات
app.get('/api/activities', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('api_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);
    
    if (error) {
      console.error('خطأ في جلب النشاطات:', error);
      return res.status(500).json({ success: false, message: 'خطأ في جلب النشاطات' });
    }
    
    // التأكد من أن النشاطات مصفوفة
    const activities = Array.isArray(data) ? data : [];
    
    // تنسيق البيانات للعرض في واجهة المستخدم
    const formattedActivities = activities.map(activity => {
      let details = '';
      try {
        if (activity.response) {
          const parsedResponse = JSON.parse(activity.response);
          details = parsedResponse.details || '';
        }
      } catch (e) {
        details = activity.response || '';
      }
      
      // تنسيق التاريخ إذا لم يكن منسقًا بالفعل
      if (!activity.formatted_date && activity.created_at) {
        activity.formatted_date = formatDateTime(new Date(activity.created_at));
      }
      
      return {
        id: activity.id,
        type: activity.query_type || 'unknown',
        username: activity.query_value || 'unknown',
        details: details,
        timestamp: activity.created_at,
        formatted_date: activity.formatted_date,
        action: activity.query_type || 'unknown'
      };
    });
    
    return res.status(200).json({ success: true, activities: formattedActivities });
  } catch (error) {
    console.error('خطأ في جلب النشاطات:', error);
    return res.status(200).json({ success: true, activities: [] });
  }
});

// نقطة نهاية API لجلب نشاطات مستخدم محدد
app.get('/api/activities/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    // جلب نشاطات المستخدم
    const { data: activities, error } = await supabase
      .from('api_logs')
      .select('*')
      .eq('query_value', userId)
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (error) {
      console.error('خطأ في جلب نشاطات المستخدم:', error);
      return res.status(200).json({ success: false, message: 'خطأ في جلب نشاطات المستخدم', activities: [] });
    }
    
    // التأكد من أن البيانات المرسلة هي مصفوفة
    const activitiesArray = Array.isArray(activities) ? activities : [];
    
    // تنسيق البيانات للعرض في واجهة المستخدم
    const formattedActivities = activitiesArray.map(activity => {
      let details = '';
      try {
        if (activity.response) {
          const parsedResponse = JSON.parse(activity.response);
          details = parsedResponse.details || '';
        }
      } catch (e) {
        details = activity.response || '';
      }
      
      // تنسيق التاريخ إذا لم يكن منسقًا بالفعل
      if (!activity.formatted_date && activity.created_at) {
        activity.formatted_date = formatDateTime(new Date(activity.created_at));
      }
      
      return {
        id: activity.id,
        type: activity.query_type || 'unknown',
        username: activity.query_value || 'unknown',
        details: details,
        timestamp: activity.created_at,
        formatted_date: activity.formatted_date,
        action: activity.query_type || 'unknown'
      };
    });
    
    res.json({
      success: true,
      activities: formattedActivities
    });
  } catch (error) {
    console.error('خطأ في جلب نشاطات المستخدم:', error);
    res.status(200).json({ 
      success: false, 
      error: 'فشل في جلب نشاطات المستخدم',
      activities: []
    });
  }
});

// API لجلب المستخدمين
app.get('/api/users', async (req, res) => {
  try {
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('*, permissions(*)')
      .order('username', { ascending: true });
    
    if (error) {
      console.error('خطأ في جلب المستخدمين:', error);
      return res.status(500).json({ error: 'حدث خطأ أثناء جلب المستخدمين' });
    }
    
    // تنسيق البيانات للعرض في واجهة المستخدم
    const users = accounts.map(account => {
      const permissions = account.permissions && account.permissions.length > 0 
        ? account.permissions[0] 
        : { can_add: false, can_delete: false, can_update: false, can_view: true };
      
      return {
        id: account.id,
        username: account.username,
        role: account.role,
        created_at: account.created_at,
        permissions: permissions
      };
    });
    
    return res.status(200).json({ users, success: true });
  } catch (error) {
    console.error('خطأ في جلب المستخدمين:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء جلب المستخدمين' });
  }
});

// الحصول على بيانات مستخدم محدد
app.get('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data: user, error } = await supabase
      .from('accounts')
      .select('*, permissions(*)')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('خطأ في جلب بيانات المستخدم:', error);
      return res.status(500).json({ success: false, message: 'خطأ في جلب بيانات المستخدم' });
    }
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }
    
    const permissions = user.permissions && user.permissions.length > 0 
      ? user.permissions[0] 
      : { can_add: false, can_delete: false, can_update: false, can_view: true };
    
    // تنسيق البيانات للعرض في واجهة المستخدم
    const formattedUser = {
      id: user.id,
      username: user.username,
      role: user.role || 'user',
      created_at: user.created_at,
      permissions: permissions,
      success: true
    };
    
    return res.status(200).json(formattedUser);
  } catch (error) {
    console.error('خطأ في جلب بيانات المستخدم:', error);
    return res.status(500).json({ success: false, message: 'خطأ في جلب بيانات المستخدم' });
  }
});

// API لإضافة مستخدم جديد
app.post('/api/users', async (req, res) => {
  const { username, password, role, can_add, can_delete, can_update, can_view } = req.body;
  
  // التحقق من وجود البيانات المطلوبة
  if (!username || !password) {
    return res.status(400).json({ 
      success: false, 
      message: "يجب توفير اسم المستخدم وكلمة المرور على الأقل" 
    });
  }
  
  try {
    // التحقق من عدم وجود مستخدم بنفس اسم المستخدم
    const { data: existingUser, error: checkError } = await supabase
      .from('accounts')
      .select('username')
      .eq('username', username)
      .single();
    
    if (checkError && checkError.code !== 'PGRST116') {
      console.error('خطأ في التحقق من وجود المستخدم:', checkError);
      return res.status(500).json({ 
        success: false, 
        message: "حدث خطأ أثناء التحقق من وجود المستخدم" 
      });
    }
    
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: "اسم المستخدم موجود بالفعل، يرجى اختيار اسم آخر" 
      });
    }
    
    // إنشاء مستخدم جديد
    const { data: newUser, error: insertError } = await supabase
      .from('accounts')
      .insert([
        {
          username,
          password_hash: password,
          role: role || 'user',
          created_at: new Date().toISOString()
        }
      ])
      .select();
    
    if (insertError) {
      console.error('خطأ في إضافة المستخدم:', insertError);
      return res.status(500).json({ 
        success: false, 
        message: "فشل في إضافة المستخدم",
        error: insertError.message
      });
    }
    
    // إضافة صلاحيات المستخدم
    if (newUser && newUser.length > 0) {
      const { error: permError } = await supabase
        .from('permissions')
        .insert([
          {
            account_id: newUser[0].id,
            can_add: can_add === true,
            can_delete: can_delete === true,
            can_update: can_update === true,
            can_view: can_view !== false // افتراضيًا true
          }
        ]);
      
      if (permError) {
        console.error('خطأ في إضافة صلاحيات المستخدم:', permError);
      }
    }
    
    // تسجيل نشاط إضافة المستخدم
    await addActivity('user_add', req.body.adminUsername || 'admin', `تمت إضافة مستخدم جديد: ${username}`);
    
    return res.status(201).json({ 
      success: true, 
      message: "تمت إضافة المستخدم بنجاح",
      user: newUser[0]
    });
  } catch (error) {
    console.error('خطأ في إضافة المستخدم:', error);
    return res.status(500).json({ 
      success: false, 
      message: "فشل في إضافة المستخدم",
      error: error.message
    });
  }
});

// API لتعديل مستخدم
app.put('/api/users/:id', async (req, res) => {
  const userId = req.params.id;
  const { username, password, role, can_add, can_delete, can_update, can_view } = req.body;
  
  try {
    // البحث عن المستخدم
    const { data: user, error: findError } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (findError || !user) {
      return res.status(404).json({ 
        success: false, 
        message: "المستخدم غير موجود" 
      });
    }
    
    // التحقق من عدم وجود مستخدم آخر بنفس اسم المستخدم الجديد
    if (username && username !== user.username) {
      const { data: existingUser, error: checkError } = await supabase
        .from('accounts')
        .select('username')
        .eq('username', username)
        .single();
      
      if (existingUser) {
        return res.status(400).json({ 
          success: false, 
          message: "اسم المستخدم موجود بالفعل، يرجى اختيار اسم آخر" 
        });
      }
    }
    
    // إعداد البيانات المحدثة
    const updates = {};
    if (username) updates.username = username;
    if (password) updates.password_hash = password;
    if (role) updates.role = role;
    
    // تحديث بيانات المستخدم
    const { data: updatedUser, error: updateError } = await supabase
      .from('accounts')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    
    if (updateError) {
      console.error('خطأ في تحديث بيانات المستخدم:', updateError);
      return res.status(500).json({ 
        success: false, 
        message: "فشل في تحديث بيانات المستخدم",
        error: updateError.message
      });
    }
    
    // تحديث الصلاحيات إذا تم تقديمها
    if (can_add !== undefined || can_delete !== undefined || can_update !== undefined || can_view !== undefined) {
      // الحصول على الصلاحيات الحالية
      const { data: permissions, error: permFetchError } = await supabase
        .from('permissions')
        .select('*')
        .eq('account_id', userId);
      
      const permUpdateData = {
        can_add: can_add === true,
        can_delete: can_delete === true,
        can_update: can_update === true,
        can_view: can_view !== false // افتراضيًا true
      };
      
      if (permissions && permissions.length > 0) {
        // تحديث الصلاحيات الموجودة
        const { error: permUpdateError } = await supabase
          .from('permissions')
          .update(permUpdateData)
          .eq('account_id', userId);
        
        if (permUpdateError) {
          console.error('خطأ في تحديث صلاحيات المستخدم:', permUpdateError);
        }
      } else {
        // إنشاء صلاحيات جديدة
        const { error: permInsertError } = await supabase
          .from('permissions')
          .insert([{ ...permUpdateData, account_id: userId }]);
        
        if (permInsertError) {
          console.error('خطأ في إنشاء صلاحيات المستخدم:', permInsertError);
        }
      }
    }
    
    // تسجيل نشاط تعديل المستخدم
    await addActivity('user_edit', req.body.adminUsername || 'admin', `تم تعديل بيانات المستخدم: ${updatedUser.username}`);
    
    return res.status(200).json({ 
      success: true, 
      message: "تم تعديل بيانات المستخدم بنجاح",
      user: updatedUser
    });
  } catch (error) {
    console.error('خطأ في تعديل المستخدم:', error);
    return res.status(500).json({ 
      success: false, 
      message: "فشل في تعديل بيانات المستخدم",
      error: error.message
    });
  }
});

// API لحذف مستخدم
app.delete('/api/users/:id', async (req, res) => {
  const userId = req.params.id;
  
  try {
    // البحث عن المستخدم قبل الحذف
    const { data: user, error: findError } = await supabase
      .from('accounts')
      .select('username, role')
      .eq('id', userId)
      .single();
    
    if (findError || !user) {
      return res.status(404).json({ 
        success: false, 
        message: "المستخدم غير موجود" 
      });
    }
    
    // التأكد من عدم حذف المدير الرئيسي
    if (user.username === 'admin' && user.role === 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: "لا يمكن حذف المدير الرئيسي" 
      });
    }
    
    // حذف المستخدم - الصلاحيات ستحذف تلقائيًا بسبب ON DELETE CASCADE
    const { error: deleteError } = await supabase
      .from('accounts')
      .delete()
      .eq('id', userId);
    
    if (deleteError) {
      console.error('خطأ في حذف المستخدم:', deleteError);
      return res.status(500).json({ 
        success: false, 
        message: "فشل في حذف المستخدم",
        error: deleteError.message
      });
    }
    
    // تسجيل نشاط حذف المستخدم
    await addActivity('user_delete', req.body.adminUsername || 'admin', `تم حذف المستخدم: ${user.username}`);
    
    return res.status(200).json({ 
      success: true, 
      message: "تم حذف المستخدم بنجاح" 
    });
  } catch (error) {
    console.error('خطأ في حذف المستخدم:', error);
    return res.status(500).json({ 
      success: false, 
      message: "فشل في حذف المستخدم",
      error: error.message
    });
  }
});

// تشغيل الخادم
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`الخادم يعمل على المنفذ ${PORT}`);
  console.log(`يمكنك الوصول إلى التطبيق على http://localhost:${PORT}`);
});